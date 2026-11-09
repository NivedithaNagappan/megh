import { defineMigration } from "@meghjs/core";

export default defineMigration({
  async up(schema) {
    await schema.create("teachers", (table) => {
      table.id();
      table.foreignId("user_id").constrained("users").nullOnDelete();
      table.string("staff_number", 32).unique();
      table.string("first_name", 100);
      table.string("last_name", 100);
      table.string("email").unique();
      table.string("phone", 32).nullable();
      table.string("specialization").nullable();
      table.date("hire_date").nullable();
      table.boolean("is_active").default(true);
      table.timestamps();
    });
  },

  async down(schema) {
    await schema.drop("teachers");
  },
});
