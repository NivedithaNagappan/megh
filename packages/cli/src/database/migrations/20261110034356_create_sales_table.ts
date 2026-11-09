import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("sales", (table) => {
      table.id();
      table.foreignId("outlet_id").constrained("outlets").onDelete("restrict");
      table.foreignId("register_id").constrained("registers").nullOnDelete();
      table.foreignId("shift_id").constrained("shifts").nullOnDelete();
      table.foreignId("customer_id").constrained("customers").nullOnDelete();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.string("number", 32).unique();
      table.decimal("subtotal", 12, 2).default(0);
      table.decimal("discount", 12, 2).default(0);
      table.decimal("tax", 12, 2).default(0);
      table.decimal("total", 12, 2).default(0);
      table.decimal("paid_amount", 12, 2).default(0);
      table.decimal("change_amount", 12, 2).default(0);
      table.string("status", 32).default("completed"); // completed | refunded | void
      table.timestamp("sold_at");
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("sales");
  },
});
