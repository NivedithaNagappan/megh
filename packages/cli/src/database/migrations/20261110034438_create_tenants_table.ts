import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("tenants", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("email").unique();
      table.string("phone", 32).nullable();
      table.date("date_of_birth").nullable();
      table.string("national_id", 64).nullable();
      table.string("employer").nullable();
      table.decimal("monthly_income", 12, 2).nullable();
      table.string("emergency_contact_name").nullable();
      table.string("emergency_contact_phone", 32).nullable();
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("tenants");
  },
});
