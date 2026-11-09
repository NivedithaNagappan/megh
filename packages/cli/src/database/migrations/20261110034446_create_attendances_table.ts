import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("attendances", (table) => {
      table.id();
      table.foreignId("employee_id").constrained("employees").cascadeOnDelete();
      table.date("date");
      table.timestamp("check_in").nullable();
      table.timestamp("check_out").nullable();
      table.string("status", 32).default("present"); // present | absent | late | half_day | on_leave
      table.decimal("hours", 5, 2).nullable();
      table.text("notes").nullable();
      table.timestamps();
      table.index("status");
      table.unique(["employee_id", "date"]);
    });
  },

  async down(schema) {
    await schema.drop("attendances");
  },
});
