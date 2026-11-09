import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("payments", (table) => {
      table.id();
      table.foreignId("order_id").constrained("orders").cascadeOnDelete();
      table.string("method", 32);
      table.string("provider", 64).nullable();
      table.string("transaction_id", 128).nullable();
      table.decimal("amount", 12, 2);
      table.string("currency", 3).default("USD");
      table.string("status", 32).default("pending"); // pending | completed | failed | refunded
      table.timestamp("paid_at").nullable();
      table.timestamps();
      table.index("transaction_id");
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("payments");
  },
});
