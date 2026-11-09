import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("carts", (table) => {
      table.id();
      table.foreignId("customer_id").constrained("customers").nullOnDelete();
      table.string("session_id", 128).nullable();
      table.string("currency", 3).default("USD");
      table.string("status", 32).default("active"); // active | converted | abandoned
      table.timestamps();
      table.index("session_id");
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("carts");
  },
});
