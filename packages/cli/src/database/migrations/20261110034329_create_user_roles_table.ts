import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("user_roles", (table) => {
      table.foreignId("user_id").constrained("users").cascadeOnDelete();
      table.foreignId("role_id").constrained("roles").cascadeOnDelete();
      table.primary(["user_id", "role_id"]);
    });
  },

  async down(schema) {
    await schema.drop("user_roles");
  },
});
