import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("projects", (table) => {
      table.id();
      table.foreignId("client_id").constrained("clients").nullOnDelete();
      table.foreignId("manager_id").constrained("users").nullOnDelete();
      table.string("name");
      table.string("code", 32).unique();
      table.text("description").nullable();
      table.string("status", 32).default("planning"); // planning | active | on_hold | completed | cancelled
      table.decimal("budget", 12, 2).nullable();
      table.date("start_date").nullable();
      table.date("end_date").nullable();
      table.string("address_line1").nullable();
      table.string("address_line2").nullable();
      table.string("city", 100).nullable();
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100).nullable();
      table.timestamps();
      table.softDeletes();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("projects");
  },
});
