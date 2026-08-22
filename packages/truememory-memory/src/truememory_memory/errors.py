class TrueMemoryError(Exception):
    def __init__(self, message: str, status: int = 0, request_id: str | None = None, details: object = None):
        super().__init__(message); self.status = status; self.request_id = request_id; self.details = details
class AuthenticationError(TrueMemoryError): pass
class AuthorizationError(TrueMemoryError): pass
class ValidationError(TrueMemoryError): pass
class RateLimitError(TrueMemoryError):
    def __init__(self, message: str, status: int = 429, request_id: str | None = None, details: object = None, retry_after: int | None = None):
        super().__init__(message, status, request_id, details); self.retry_after = retry_after
class NotFoundError(TrueMemoryError): pass
class ConflictError(TrueMemoryError): pass
class NetworkError(TrueMemoryError): pass
class ServerError(TrueMemoryError): pass

KontextError = TrueMemoryError
