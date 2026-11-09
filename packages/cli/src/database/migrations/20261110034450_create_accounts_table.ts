import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("accounts", (table) => {
      table.id();
      table.foreignId("owner_id").constrained("users").nullOnDelete();
      table.string("name");
      table.string("industry", 64).nullable();
      table.string("website", 2048).nullable();
      table.string("phone", 32).nullable();
      table.string("email").nullable();
      table.string("address_line1").nullable();
      table.string("address_line2").nullable();
      table.string("city", 100).nullable();
      table.string("state", 100).nullable();
      table.string("postal_code", 20).nullable();
      table.string("country", 100).nullable();
      table.decimal("annual_revenue", 12, 2).nullable();
      table.integer("employee_count").nullable();
      table.string("status", 32).default("prospect"); // prospect | customer | partner | inactive
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("accounts");
  },
});
