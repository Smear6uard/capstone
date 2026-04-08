from __future__ import annotations

import asyncio

import httpx
import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from app import main


class DemoResponse(BaseModel):
    value: str


class FakeResponse:
    def __init__(
        self,
        *,
        json_data: dict | None = None,
        json_error: Exception | None = None,
        status_error: Exception | None = None,
    ) -> None:
        self._json_data = json_data
        self._json_error = json_error
        self._status_error = status_error

    def raise_for_status(self) -> None:
        if self._status_error is not None:
            raise self._status_error

    def json(self) -> dict:
        if self._json_error is not None:
            raise self._json_error
        return self._json_data or {}


class FakeAsyncClient:
    def __init__(
        self,
        *,
        response: FakeResponse | None = None,
        post_error: Exception | None = None,
    ) -> None:
        self.response = response
        self.post_error = post_error
        self.calls: list[tuple[str, dict, dict]] = []

    async def __aenter__(self) -> FakeAsyncClient:
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False

    async def post(self, url: str, *, headers: dict, json: dict) -> FakeResponse:
        self.calls.append((url, headers, json))
        if self.post_error is not None:
            raise self.post_error
        assert self.response is not None
        return self.response


def patch_async_client(
    monkeypatch: pytest.MonkeyPatch, client: FakeAsyncClient
) -> FakeAsyncClient:
    monkeypatch.setattr(main, "get_together_api_key", lambda: "test-key")
    monkeypatch.setattr(main.httpx, "AsyncClient", lambda *args, **kwargs: client)
    return client


def test_call_together_json_returns_validated_model(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    response = FakeResponse(
        json_data={
            "choices": [
                {
                    "message": {
                        "content": '```json\n{"value":"ok"}\n```',
                    }
                }
            ]
        }
    )
    client = patch_async_client(monkeypatch, FakeAsyncClient(response=response))

    result = asyncio.run(
        main.call_together_json(
            messages=[{"role": "user", "content": "Hello"}],
            response_model=DemoResponse,
            temperature=0.3,
        )
    )

    assert result == DemoResponse(value="ok")
    url, headers, payload = client.calls[0]
    assert url == main.TOGETHER_API_URL
    assert headers["Authorization"] == "Bearer test-key"
    # Together wants the flat {"type": "json_schema", "schema": ...} form,
    # and we strip constraint keywords so the grammar compiler stays fast.
    response_format = payload["response_format"]
    assert response_format["type"] == "json_schema"
    assert "json_schema" not in response_format
    sent_schema = response_format["schema"]
    assert sent_schema["type"] == "object"
    assert sent_schema["properties"]["value"] == {"type": "string"}
    assert "title" not in sent_schema
    assert "$defs" not in sent_schema


def test_call_together_json_maps_http_status_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = httpx.Request("POST", main.TOGETHER_API_URL)
    response = httpx.Response(401, request=request, text="upstream rejected the call")
    client = patch_async_client(
        monkeypatch,
        FakeAsyncClient(
            response=FakeResponse(
                status_error=httpx.HTTPStatusError(
                    "bad status", request=request, response=response
                )
            )
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            main.call_together_json(
                messages=[{"role": "user", "content": "Hello"}],
                response_model=DemoResponse,
            )
        )

    assert client.calls
    assert exc_info.value.status_code == 502
    assert "Together API returned an error" in exc_info.value.detail
    assert "upstream rejected the call" in exc_info.value.detail


def test_call_together_json_maps_network_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = patch_async_client(
        monkeypatch,
        FakeAsyncClient(post_error=httpx.ConnectError("boom")),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            main.call_together_json(
                messages=[{"role": "user", "content": "Hello"}],
                response_model=DemoResponse,
            )
        )

    assert len(client.calls) == 2
    assert exc_info.value.status_code == 502
    assert "Failed to reach Together API" in exc_info.value.detail
    assert "ConnectError" in exc_info.value.detail


def test_call_together_json_maps_timeout_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = patch_async_client(
        monkeypatch,
        FakeAsyncClient(post_error=httpx.ReadTimeout("timed out")),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            main.call_together_json(
                messages=[{"role": "user", "content": "Hello"}],
                response_model=DemoResponse,
            )
        )

    assert len(client.calls) == 2
    assert exc_info.value.status_code == 504
    assert "request timed out" in exc_info.value.detail


def test_call_together_json_rejects_invalid_http_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = patch_async_client(
        monkeypatch,
        FakeAsyncClient(response=FakeResponse(json_error=ValueError("invalid json"))),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            main.call_together_json(
                messages=[{"role": "user", "content": "Hello"}],
                response_model=DemoResponse,
            )
        )

    assert client.calls
    assert exc_info.value.status_code == 502
    assert "invalid JSON at the HTTP layer" in exc_info.value.detail


def test_call_together_json_rejects_schema_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = patch_async_client(
        monkeypatch,
        FakeAsyncClient(
            response=FakeResponse(
                json_data={
                    "choices": [
                        {
                            "message": {
                                "content": '{"unexpected":"field"}',
                            }
                        }
                    ]
                }
            )
        ),
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            main.call_together_json(
                messages=[{"role": "user", "content": "Hello"}],
                response_model=DemoResponse,
            )
        )

    assert client.calls
    assert exc_info.value.status_code == 502
    assert "did not match the expected schema" in exc_info.value.detail
