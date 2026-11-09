import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("role_permissions", (table) => {
      table.foreignId("role_id").constrained("roles").cascadeOnDelete();
      table.foreignId("permission_id").constrained("permissions").cascadeOnDelete();
      table.primary(["role_id", "permission_id"]);
    });
  },

  async down(schema) {
    await schema.drop("role_permissions");
  },
});
