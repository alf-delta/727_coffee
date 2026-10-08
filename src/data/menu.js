export const drinkMenu = {
  title: 'Drink Menu',
  sections: [
    {
      name: 'Coffee Classics',
      items: [
        { name: 'Espresso', price: '4.50' },
        { name: 'Long Black', price: '4.50' },
        { name: 'Cortado', price: '5.50' },
        { name: 'Cappuccino', price: '5.75' },
        { name: 'Latte', price: '6.75', highlight: { title: 'ALL-TIME BESTSELLER', description: 'Our bestselling coffee of all time' } },
        { name: 'Mocha', price: '8.00', note: 'With Real Belgian Chocolate' },
      ],
    },
    {
      name: 'Signature Coffee',
      note: 'Available hot or iced • Large iced + $1.50',
      items: [
        { name: 'Crème Brûlée Latte', price: '8.00' },
        { name: 'Vanilla Silky Latte', price: '7.75', highlight: { title: 'MONTH’S BESTSELLER', description: 'Our most-loved coffee this month', month: '2026-09' } },
        { name: 'Popcorn Latte', price: '8.00' },
        { name: 'Chili Honey Latte', price: '8.00' },
        { name: 'Pumpkin Spice Latte', price: '8.00' },
        { name: 'Black Sesame Latte', price: '8.00' },
      ],
    },
    {
      name: 'Other',
      sizes: ['S', 'M'],
      items: [{ name: 'Hot Chocolate', price: ['6.50', '8.00'], note: 'With Real Belgian Chocolate' }],
    },
    {
      name: 'Drip / Pour Over',
      items: [
        { name: 'Drip (S/M)', price: ['4.50', '6.00'] },
        { name: 'Pour Over', price: 'See Pour Over Menu' },
      ],
    },
    {
      name: 'Iced Coffee',
      sizes: ['S', 'L'],
      items: [
        { name: 'Cold Brew', price: ['5.00', '7.00'], highlight: { title: 'GUEST FAVORITE · ICED', description: 'Our guests’ favorite iced drink' } },
        { name: 'Iced Americano', price: ['5.00', '7.00'] },
        { name: 'Iced Latte', price: ['6.75', '8.50'] },
        { name: 'Espresso Tonic', price: '7.75' },
      ],
    },
    {
      name: 'Tea & Matcha',
      items: [
        { name: 'Matcha Latte', price: '7.00', highlight: { title: 'MATCHA BESTSELLER', description: 'Our bestselling matcha drink' } },
        { name: 'Strawberry Matcha', price: '8.00' },
        { name: 'Chai Latte', price: '7.00' },
        { name: 'Passion Fruit Sea Buckthorn', price: '8.00', highlight: { title: '#1 WELLNESS PICK', description: 'The top pick for wellness-minded guests' } },
        { name: 'Black Sesame Matcha', price: '8.00' },
        { name: 'Soba Buckwheat Tea', price: '6.50' },
        { name: 'Tea', price: '4.50', note: 'Black Tea / Green Tea / Fruit Infusion / Chamomile' },
      ],
    },
    {
      name: 'Iced Tea',
      sizes: ['S', 'L'],
      items: [
        { name: 'Iced Tea', price: ['5.00', '6.50'] },
        { name: 'Iced Matcha Latte', price: ['7.00', '8.50'] },
        { name: 'Strawberry Matcha', price: ['8.00', '9.50'] },
      ],
    },
    {
      name: 'Extras',
      items: [
        { name: 'Extra Shot', price: '2.50' },
        { name: 'Cold Foam', price: '1.75' },
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
        { name: 'Eggs Benedict', price: '17.00', image: '/kitchen_menu/Eggs Benedict.webp', desc: 'English Muffin / Organic Turkey / Poached Eggs / Hollandaise Sauce / Shichimi Togarashi / Side Salad' },
        { name: 'Avocado Egg Toast', price: '16.00', highlight: { title: 'BRUNCH BESTSELLER', description: 'Our bestselling breakfast and brunch dish' }, image: '/kitchen_menu/Avocado Egg Toast.webp', desc: 'Sourdough / Microgreens / Guacamole / Onions / Poached Egg / Aged Parmesan' },
        { name: 'Smoked Salmon Cream Cheese Toast', price: '19.00', image: '/kitchen_menu/Smoked Salmon Cream Cheese Toast.webp', desc: 'Sourdough / Cream Cheese / Pesto / Lemon Zest / Dill / Capers' },
        { name: 'Chia Cup', price: '12.00', image: '/kitchen_menu/Chia Cup.webp', desc: 'Chia Seeds / Greek Yogurt / Pistachios / Organic Berry Jam / Fresh Berries' },
      ],
    },
    {
      name: 'Mono Blend Signatures',
      items: [
        { name: 'Syrnik Classic', price: '18.00', highlight: { title: 'POPULAR PICK', description: 'One of our most-ordered dishes' }, image: '/kitchen_menu/Syrnik Classic.webp', desc: "Baked Farmer's Cheese Pancakes / Sour Cream / Strawberry Sauce / Fresh Berries" },
        { name: 'Syrnik Pistachio & Raspberry', price: '19.50', highlight: { title: 'KITCHEN BESTSELLER', description: 'Our most-ordered kitchen dish' }, image: '/kitchen_menu/syrnik-pistachio-raspberry.webp', desc: "Baked Farmer's Cheese Pancakes / Roasted Pistachio Custard / Raspberries / Mint" },
        { name: 'Syrnik Oreo & Cherry', price: '19.50', image: '/kitchen_menu/syrnik-oreo-cherry.webp', desc: "Baked Farmer's Cheese Pancakes / Maraschino Cherry Sauce / Mascarpone Cream / Oreo Cookie Crumble" },
      ],
    },
    {
      name: 'Wraps',
      items: [
        { name: 'Caesar Wrap', price: '16.00', highlight: { title: 'NEW MENU PICK', description: 'Try something new: our Caesar Wrap' }, image: '/kitchen_menu/caesar-wrap.webp', desc: 'Smoked Chicken / Romaine Lettuce / Caesar Dressing / Parmesan' },
        { name: 'Salmon Wrap', price: '18.00', image: '/kitchen_menu/salmon-wrap.webp', desc: 'Smoked Salmon / Capers / Tzatziki / Avocado / Green Mix / Cucumber / Red Onion' },
        { name: 'Turkey Wrap', price: '17.00', image: '/kitchen_menu/turkey-wrap.webp', desc: 'Turkey Breast / Swiss Cheese / Green Mix / White Garlic Sauce / Grilled Pepper' },
      ],
    },
    {
      name: 'Panini & Sandwiches',
      items: [
        { name: 'Grilled Chicken Panini', price: '17.00', image: '/kitchen_menu/Grilled Chicken Panini.webp', desc: 'Organic Chicken Breast / Mozzarella / Guacamole / Pico De Gallo / Sour Cream / Lime' },
        { name: 'Turkey Swiss Melt', price: '16.00', image: '/kitchen_menu/Turkey Swiss Melt.webp', desc: 'Turkey Breast / Swiss Cheese / Light Sauce / Pickles / Lettuce' },
        { name: 'Caprese Toast', price: '16.00', image: '/kitchen_menu/Caprese Toast.webp', desc: 'Garden Tomatoes / Fresh Mozzarella / Arugula / Genovese Pesto / Aged Balsamic / EVOO' },
        { name: 'Tuna Avo Sandwich', price: '17.00', highlight: { title: 'SANDWICH BESTSELLER', description: 'Our bestselling sandwich' }, image: '/kitchen_menu/Tuna Avo Sandwich.webp', desc: 'Albacore Tuna / Mayo / Avocado / Pickles / Tomatoes / Japanese Spices / Fresh Herbs' },
      ],
    },
  ],
  notes: ['Have an allergy? Give us a heads up — please let us know before ordering so we can do our best to accommodate you.', '** Consuming raw or undercooked meats, poultry, seafood, shellfish, or eggs may increase your risk of foodborne illness.'],
};
