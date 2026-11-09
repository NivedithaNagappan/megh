import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("leave_requests", (table) => {
      table.id();
      table.foreignId("employee_id").constrained("employees").cascadeOnDelete();
      table.foreignId("leave_type_id").constrained("leave_types").onDelete("restrict");
      table.foreignId("approved_by_id").constrained("users").nullOnDelete();
      table.date("start_date");
      table.date("end_date");
      table.decimal("days", 5, 1);
      table.text("reason").nullable();
      table.string("status", 32).default("pending"); // pending | approved | rejected | cancelled
      table.timestamp("approved_at").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("leave_requests");
  },
});
