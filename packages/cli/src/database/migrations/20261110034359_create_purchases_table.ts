import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("purchases", (table) => {
      table.id();
      table.foreignId("supplier_id").constrained("suppliers").onDelete("restrict");
      table.foreignId("outlet_id").constrained("outlets").nullOnDelete();
      table.string("number", 32).unique();
      table.string("status", 32).default("draft"); // draft | ordered | received | cancelled
      table.decimal("subtotal", 12, 2).default(0);
      table.decimal("tax", 12, 2).default(0);
      table.decimal("total", 12, 2).default(0);
      table.timestamp("ordered_at").nullable();
      table.timestamp("received_at").nullable();
      table.text("notes").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("purchases");
  },
});
