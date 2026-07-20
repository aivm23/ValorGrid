# Import Excel

Community import is intentionally limited to the official ValorGrid Excel template.

Rules:

- Use `.xlsx`.
- Keep the canonical worksheet and headers.
- The `Yahoo` header is part of the canonical template. Its cell value is optional; when present it is used as the provider reference for new instrument creation and mismatch warnings.
- Keep the XLSX file under 2 MB. The import endpoint allows the JSON/base64 envelope needed to transport that file size.
- Do not upload broker exports directly in Community.
- Review the preview before committing.
- Use rollback by batch if an import must be undone.

The English UI may localize instructions and helper text, but the canonical template headers remain stable in this release to avoid breaking existing imports.

Broker-specific adapters belong to Professional/Enterprise editions and are not documented in the public Community repository.
