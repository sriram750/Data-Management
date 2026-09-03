import base64
import json
import os
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, Union
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

from app.core.config import settings
from app.core.exceptions import DecryptionException


class KeyProvider(ABC):
    """Abstract key provider interface for secret encryption keys.
    Can be backed by Environment Variables, HashiCorp Vault, AWS Secrets Manager, or Azure Key Vault."""
    
    @abstractmethod
    def get_master_key(self) -> bytes:
        pass


class EnvKeyProvider(KeyProvider):
    """Environment-based key provider using HKDF derivation."""
    
    def __init__(self, key_material: Optional[str] = None):
        self._raw_key = (key_material or settings.ENCRYPTION_KEY).encode("utf-8")
        
    def get_master_key(self) -> bytes:
        # Derive a robust 256-bit (32 bytes) key using HKDF-SHA256 with a fixed context salt
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"antigravity_dynamic_data_salt_v1",
            info=b"aes256_gcm_column_encryption",
        )
        return hkdf.derive(self._raw_key)


class SensitiveEncryptionService:
    """Provides authenticated AES-256-GCM encryption for sensitive columns such as passwords and secret fields.
    Guarantees:
    - Authenticated encryption (ciphertext integrity + confidentiality)
    - Unique 96-bit (12 byte) random IV per encryption
    - Payload serialization with versioning metadata
    - Safe error handling without plaintext leaks
    """
    
    def __init__(self, key_provider: Optional[KeyProvider] = None):
        self._key_provider = key_provider or EnvKeyProvider()
        self._aesgcm: Optional[AESGCM] = None
        
    def _get_cipher(self) -> AESGCM:
        if self._aesgcm is None:
            derived_key = self._key_provider.get_master_key()
            self._aesgcm = AESGCM(derived_key)
        return self._aesgcm

    def encrypt(self, plaintext: Union[str, int, float, dict, list, None], context: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Encrypts plaintext and returns an envelope dict with base64-encoded ciphertext and nonce."""
        if plaintext is None:
            return None
        
        # Serialize to string
        if isinstance(plaintext, (dict, list)):
            data_str = json.dumps(plaintext)
        else:
            data_str = str(plaintext)
            
        nonce = os.urandom(12)  # 96-bit standard nonce for GCM
        associated_data = context.encode("utf-8") if context else None
        
        cipher = self._get_cipher()
        ciphertext = cipher.encrypt(nonce, data_str.encode("utf-8"), associated_data)
        
        return {
            "__encrypted": True,
            "v": 1,
            "nonce": base64.b64encode(nonce).decode("ascii"),
            "data": base64.b64encode(ciphertext).decode("ascii"),
        }

    def decrypt(self, encrypted_payload: Any, context: Optional[str] = None) -> Optional[str]:
        """Decrypts an encrypted payload envelope back to plaintext string."""
        if encrypted_payload is None:
            return None
            
        if not isinstance(encrypted_payload, dict) or not encrypted_payload.get("__encrypted"):
            # Not an encrypted envelope, return string representation
            return str(encrypted_payload)
            
        try:
            nonce = base64.b64decode(encrypted_payload["nonce"])
            ciphertext = base64.b64decode(encrypted_payload["data"])
            associated_data = context.encode("utf-8") if context else None
            
            cipher = self._get_cipher()
            decrypted_bytes = cipher.decrypt(nonce, ciphertext, associated_data)
            return decrypted_bytes.decode("utf-8")
        except Exception as e:
            raise DecryptionException(f"Failed to decrypt sensitive field: {str(e)}")

    @staticmethod
    def is_encrypted_envelope(value: Any) -> bool:
        return isinstance(value, dict) and value.get("__encrypted") is True

    @staticmethod
    def mask_value(value: Any) -> str:
        """Returns standard enterprise bullet mask for sensitive data."""
        if value is None or value == "":
            return ""
        return "••••••••"


encryption_service = SensitiveEncryptionService()
