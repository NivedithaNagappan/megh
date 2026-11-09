import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("api_keys", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").cascadeOnDelete();
      table.string("name", 100);
      table.string("prefix", 16);
      table.string("key_hash", 64).unique();
      table.timestamp("last_used_at").nullable();
      table.timestamp("expires_at").nullable();
      table.timestamp("revoked_at").nullable();
      table.timestamps();
      table.index("prefix");
    });
  },

  async down(schema) {
    await schema.drop("api_keys");
  },
});
