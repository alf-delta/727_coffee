export const drinkMenu = {
  title: 'Drink Menu',
  sections: [
    {
      name: 'Coffee Classics',
      items: [
        { name: 'Espresso', price: '4.50' },
        { name: 'Long Black', price: '4.50' },
        { name: 'Cortado', price: '5.50' },
        { name: 'Cappuccino', price: '5.50' },
        { name: 'Latte', price: '6.50' },
        { name: 'Mocha', price: '7.50' },
      ],
    },
    {
      name: 'Signature Coffee',
      items: [
        { name: 'Vanilla Silky Latte', price: '7.50' },
        { name: 'Crème Brûlée Latte', price: '8.00' },
      ],
    },
    {
      name: 'Other',
      sizes: ['S', 'M'],
      items: [{ name: 'Hot Chocolate', price: ['6.00', '7.00'] }],
    },
    {
      name: 'Drip / Pour Over',
      items: [
        { name: 'Drip (S/M)', price: '4.50 / 6.00' },
        { name: 'Pour Over', price: 'See Pour Over Menu' },
      ],
    },
    {
      name: 'Iced Coffee',
      sizes: ['S', 'L'],
      items: [
        { name: 'Cold Brew', price: ['4.50', '6.00'] },
        { name: 'Iced Americano', price: ['5.00', '7.00'] },
        { name: 'Iced Latte', price: ['6.00', '8.00'] },
        { name: 'Espresso Tonic', price: '7.00' },
      ],
    },
    {
      name: 'Tea & Matcha',
      items: [
        { name: 'Matcha Latte', price: '7.00' },
        { name: 'Chai Latte', price: '7.00' },
        { name: 'Passion Fruit Sea Buckthorn', price: '8.00' },
        { name: 'Soba Buckwheat Tea', price: '6.50' },
        { name: 'Tea', price: '4.50', note: 'Black Tea / Green Tea / Fruit Infusion / Chamomile' },
      ],
    },
    {
      name: 'Iced Tea',
      sizes: ['S', 'L'],
      items: [
        { name: 'Iced Tea', price: ['5.00', '6.50'] },
        { name: 'Iced Matcha Latte', price: ['7.00', '9.00'] },
        { name: 'Matcha Piña Colada', price: ['8.00', '9.50'] },
        { name: 'Cherry Matcha', price: ['8.00', '9.50'] },
      ],
    },
  ],
  notes: ['Alternative milk is always free.', 'Please notify us of any food allergy or intolerance. Ingredient information is available upon request.'],
};

export const kitchenMenu = {
  title: 'Kitchen Menu',
  sections: [
    {
      name: 'All-Day Breakfast & Brunch',
      items: [
        { name: 'Eggs Benedict', price: '17.00', desc: 'English Muffin / Organic Turkey / Poached Eggs / Hollandaise Sauce / Shichimi Togarashi / Side Salad' },
        { name: 'Avocado Egg Toast', price: '16.00', desc: 'Sourdough / Microgreens / Guacamole / Onions / Poached Egg / Aged Parmesan' },
        { name: 'English Breakfast Style Pot', price: '18.00', desc: 'Schiacciata Bread / Oak-Smoked Chicken / Egg / Beans / Roasted Potatoes / Passata' },
        { name: 'Smoked Salmon Cream Cheese Toast', price: '19.00', desc: 'Sourdough / Cream Cheese / Pesto / Lemon Zest / Dill / Capers' },
        { name: 'Chia Cup', price: '12.00', desc: 'Chia Seeds / Greek Yogurt / Pistachios / Organic Berry Jam / Fresh Berries' },
      ],
    },
    {
      name: 'Mono Blend Signatures',
      items: [
        { name: 'Syrnik Classic', price: '18.00', desc: "Baked Farmer's Cheese Pancakes / Sour Cream / Strawberry Sauce / Fresh Berries" },
        { name: 'Syrnik Pistachio & Raspberry', price: '19.50', desc: "Baked Farmer's Cheese Pancakes / Roasted Pistachio Custard / Raspberries / Mint" },
        { name: 'Syrnik Oreo & Cherry', price: '19.50', desc: "Baked Farmer's Cheese Pancakes / Maraschino Cherry Sauce / Mascarpone Cream / Oreo Cookie Crumble" },
      ],
    },
    {
      name: 'Salads',
      items: [
        { name: 'Burrata and Seasonal Tomatoes', price: '18.00', desc: 'Creamy Burrata / Garden Tomato Selection / Genovese Pesto / Modena Balsamic / Pea Shoots' },
        { name: 'Caesar Salad and Smoked Chicken', price: '17.00', desc: 'Romaine Lettuce / Smoked Chicken / Caesar Dressing / Aged Parmesan / Croutons' },
        { name: 'Greek', price: '16.00', desc: 'Organic Feta / Mediterranean Olives / Garden Vegetables / Oregano / Honey-Mustard Dressing' },
      ],
    },
    {
      name: 'Panini & Sandwiches',
      items: [
        { name: 'Grilled Chicken Panini', price: '17.00', desc: 'Organic Chicken Breast / Mozzarella / Guacamole / Pico De Gallo / Sour Cream / Lime' },
        { name: 'Turkey Swiss Melt', price: '16.00', desc: 'Turkey Breast / Swiss Cheese / Light Sauce / Pickles / Lettuce' },
        { name: 'Caprese Toast', price: '16.00', desc: 'Garden Tomatoes / Fresh Mozzarella / Arugula / Genovese Pesto / Aged Balsamic / EVOO' },
        { name: 'Tuna Avo Sandwich', price: '17.00', desc: 'Albacore Tuna / Mayo / Avocado / Pickles / Tomatoes / Japanese Spices / Fresh Herbs' },
      ],
    },
  ],
  notes: ['Have an allergy? Give us a heads up — please let us know before ordering so we can do our best to accommodate you.', '** Consuming raw or undercooked meats, poultry, seafood, shellfish, or eggs may increase your risk of foodborne illness.'],
};
