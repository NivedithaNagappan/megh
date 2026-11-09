import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("coupons", (table) => {
      table.id();
      table.string("code", 32).unique();
      table.text("description").nullable();
      table.string("discount_type", 32); // percent | fixed
      table.decimal("value", 12, 2);
      table.decimal("min_order_amount", 12, 2).nullable();
      table.integer("max_uses").nullable();
      table.integer("used_count").default(0);
      table.timestamp("starts_at").nullable();
      table.timestamp("ends_at").nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("coupons");
  },
});
