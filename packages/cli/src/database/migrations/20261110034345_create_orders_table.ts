import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("orders", (table) => {
      table.id();
      table.foreignId("customer_id").constrained("customers").nullOnDelete();
      table.foreignId("coupon_id").constrained("coupons").nullOnDelete();
      table.string("number", 32).unique();
      table.string("status", 32).default("pending"); // pending | paid | processing | shipped | delivered | cancelled | refunded
      table.decimal("subtotal", 12, 2).default(0);
      table.decimal("discount", 12, 2).default(0);
      table.decimal("tax", 12, 2).default(0);
      table.decimal("shipping_total", 12, 2).default(0);
      table.decimal("total", 12, 2).default(0);
      table.string("currency", 3).default("USD");
      table.json("shipping_address").nullable();
      table.json("billing_address").nullable();
      table.timestamp("placed_at").nullable();
      table.text("notes").nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("orders");
  },
});
