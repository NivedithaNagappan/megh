import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("customers", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("email").unique();
      table.string("phone", 32).nullable();
      table.boolean("accepts_marketing").default(false);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("customers");
  },
});
