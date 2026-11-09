import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("subscribers", (table) => {
      table.id();
      table.string("email").unique();
      table.string("name").nullable();
      table.string("status", 32).default("pending"); // pending | subscribed | unsubscribed | bounced
      table.string("source", 64).nullable();
      table.timestamp("subscribed_at").nullable();
      table.timestamp("unsubscribed_at").nullable();
      table.string("ip_address", 45).nullable();
      table.timestamps();
      table.index("status");
    });
  },

  async down(schema) {
    await schema.drop("subscribers");
  },
});
