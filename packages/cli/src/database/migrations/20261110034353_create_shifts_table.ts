import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("shifts", (table) => {
      table.id();
      table.foreignId("register_id").constrained("registers").cascadeOnDelete();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.timestamp("opened_at");
      table.timestamp("closed_at").nullable();
      table.decimal("opening_cash", 12, 2).default(0);
      table.decimal("closing_cash", 12, 2).nullable();
      table.decimal("expected_cash", 12, 2).nullable();
      table.string("status", 32).default("open"); // open | closed
      table.text("notes").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("shifts");
  },
});
