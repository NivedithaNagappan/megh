import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("drivers", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.foreignId("vehicle_id").constrained("vehicles").nullOnDelete();
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("phone", 32);
      table.string("email").nullable();
      table.string("license_number", 64).unique();
      table.date("license_expires_at").nullable();
      table.string("status", 32).default("available"); // available | on_trip | off_duty | inactive
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("drivers");
  },
});
