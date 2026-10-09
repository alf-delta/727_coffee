import { kitchenMenu } from './menu.js';

// Only explicitly confirmed offer items belong here. The full menu is separate.
export const officeOffers = {
  breakfast: {
    title: 'Breakfast',
    time: 'Mon–Fri · 7–11 AM',
    price: '19.99',
    conditions: 'Choose any syrniki dish below and any coffee for $19.99. Available Monday through Friday, 7–11 AM, local café time.',
    summary: 'Any syrniki + any coffee.',
    cardItems: ['Classic', 'Pistachio & Raspberry', 'Oreo & Cherry'],
    itemNames: [
      'Syrnik Classic',
      'Syrnik Pistachio & Raspberry',
      'Syrnik Oreo & Cherry',
    ],
  },
  lunch: {
    title: 'Lunch',
    time: '11 AM – 4 PM',
    price: '19.99',
    conditions: 'Choose one of the 8 kitchen dishes below and any coffee for $19.99. Available 11 AM–4 PM, local café time.',
    summary: 'A selected kitchen dish + any coffee.',
    cardItems: ['Eggs Benedict & Avocado Egg Toast', 'Caesar Wrap & Turkey Wrap', 'All panini & sandwiches'],
    itemNames: [
      'Eggs Benedict',
      'Avocado Egg Toast',
      'Caesar Wrap',
      'Turkey Wrap',
      'Grilled Chicken Panini',
      'Turkey Swiss Melt',
      'Caprese Toast',
      'Tuna Avo Sandwich',
    ],
  },
  team: {
    title: '10% off for the team',
    time: 'All day',
    conditions: 'Come with 3 or more people and share one check to receive 10% off. The team offer is available all day.',
    itemNames: [],
  },
};

export function getOfficeOfferItems(offer) {
  const items = kitchenMenu.sections.flatMap((section) => section.items);
  return offer.itemNames.map((name) => {
    const item = items.find((candidate) => candidate.name === name);
    if (!item) throw new Error(`Unknown office offer item: ${name}`);
    return item;
  });
}
