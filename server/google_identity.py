"""Verify Google Identity Services credentials before issuing Inkling sessions."""

from functools import partial

from google.auth import exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from requests import Session

from .accounts import AccountError


def verify_credential(credential: str, client_id: str) -> tuple[str, str]:
    """Return the verified Google subject and email for the configured client."""
    try:
        with Session() as session:
            transport = partial(google_requests.Request(session), timeout=10)
            claims = id_token.verify_oauth2_token(credential, transport, client_id)
    except exceptions.TransportError:
        raise AccountError(502, 'Google sign-in is temporarily unavailable. Try again.') from None
    except (ValueError, exceptions.GoogleAuthError):
        raise AccountError(401, 'Google sign-in could not be verified.') from None

    subject = claims.get('sub')
    email = claims.get('email')
    if (
        not isinstance(subject, str) or not 1 <= len(subject) <= 255
        or not isinstance(email, str) or not 1 <= len(email) <= 254
        or claims.get('email_verified') is not True
    ):
        raise AccountError(401, 'Sign in with a Google account that has a verified email address.')
    return subject, email
