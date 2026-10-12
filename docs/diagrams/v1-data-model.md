# v1 data model

```mermaid
erDiagram
  User ||--o{ Membership : belongs_to
  Guild ||--o{ Membership : has
  User ||--o{ AuthSession : authenticates
  Guild ||--o{ Decision : scopes
  User {
    string id PK "Discord user ID"
  }
  Guild {
    string id PK "Discord guild ID"
    string name
  }
  Membership {
    string userId PK,FK
    string guildId PK,FK
    string permissions
    boolean owner
    datetime refreshedAt
  }
  AuthSession {
    string id PK
    string userId FK
    string refreshToken "AES-GCM ciphertext"
    datetime expiresAt
    datetime refreshedAt
  }
  OAuthState {
    string nonce PK
    datetime expiresAt
  }
  Decision {
    string id PK
    string guildId "Logical association; preserves unknown guilds"
    int version
    string status
  }
```

User–Guild membership is persisted from Discord OAuth `guilds`, expires for authorization after 15 minutes, and is replaced on refresh. An AuthSession binds the JWT to a persisted user and encrypted Discord refresh credential. OAuthState is a browser-bound, five-minute, one-use nonce.

Decision.guildId remains its existing logical association rather than adding an immediate foreign key: the Bot may ingest a guild before a user logs in. The additive auth migration seeds Guild from existing Decision guild IDs and grants no memberships. Existing Decision, candidate history, Evidence Hash, feedback and checkpoint tables are retained.
