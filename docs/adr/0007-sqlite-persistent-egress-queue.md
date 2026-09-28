# SQLite Persistent Queue for Web Egress

To prevent data loss from network blips or Web Consumer downtime, outgoing Decision Payloads are written to a local SQLite persistent queue and retried with exponential backoff until acknowledged (at-least-once delivery).
