import { domain } from "../template";

export const common = domain("common", "Common", "Users, roles, categories and other tables most apps share", [
  [
    "user",
    "An account that signs in",
    ["name", "email:unique", "password", "email_verified_at", "remember_token", "is_active", "last_login_at"],
    { softDeletes: true },
  ],
  ["role", "A named set of permissions", ["name:string(64):unique", "slug:string(64):unique", "description"]],
  [
    "permission",
    "One thing a role may do, e.g. posts.create",
    ["name:string(128):unique", "group?:string(64)", "description"],
  ],
  ["user_role", "Which roles each user has", ["user_id:cascade", "role_id:cascade"], { pivot: true }],
  [
    "role_permission",
    "Which permissions each role has",
    ["role_id:cascade", "permission_id:cascade"],
    { pivot: true },
  ],
  [
    "category",
    "A nestable category",
    ["parent_id:foreign(categories):nullOnDelete", "name", "slug", "description", "image", "sort_order", "is_active"],
  ],
  ["tag", "A free-form label", ["name:string(64)", "slug:string(64):unique"]],
  [
    "address",
    "A postal address of any record (addressable_type + addressable_id)",
    ["addressable_type:string(64):index", "addressable_id:integer:index", "label?:string(64)", "address", "geo", "is_default:boolean:default(false)"],
  ],
  [
    "attachment",
    "An uploaded file of any record (attachable_type + attachable_id)",
    [
      "attachable_type:string(64):index",
      "attachable_id:integer:index",
      "name",
      "path:string(2048)",
      "disk:string(32):default(local)",
      "mime_type?:string(128)",
      "size:integer:default(0)",
    ],
  ],
  [
    "api_key",
    "An API key of a user; only its SHA-256 hash is stored",
    [
      "user_id:cascade",
      "name:string(100)",
      "prefix:string(16):index",
      "key_hash:string(64):unique",
      "last_used_at?:timestamp",
      "expires_at?:timestamp",
      "revoked_at?:timestamp",
    ],
  ],
  ["setting", "An application setting", ["name:string(128):unique", "value?:text", "group?:string(64)"]],
]);
