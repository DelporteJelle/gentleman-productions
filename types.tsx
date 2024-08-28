export interface Event {
  uuid: string;
  title: string;
  dates: {
    start: Date;
    end: Date;
    price: number;
    external_link?: string;
  }[];
  description: string;
  mainImage: string;
  images: string[];
  location: {
    country: string;
    city: string;
    street: string;
    location: string;
  };
}

// const mockdata = {
//   mainHighlight: {
//     title: "End of the line",
//     dates: [new Date(2024, 10, 30), new Date(2024, 11, 1)],
//   },
//   Events: [
//     {
//       title: "Deal or No Deal?",
//       text: "The Gentleman keert terug naar Merelbeke met een nieuw fris verhaal vol drama en zottigheid. \nEchter, deze keer loopt het niet van een leien dakje, er is storm op komst en de oorzaak is ongekend. \nKom kijken en beleef mee wat Damon en Jowie in petto hebben.",
//       dates: [new Date(2023, 11, 2), new Date(2023, 11, 3)],
//       imageSrc: "/Event_2.jpeg",
//     },
//     {
//       title: "The Gentleman, Welcome to the upper class",
//       text: "Hoe het allemaal begon: charmant, sexy en stijlvol.",
//       dates: [new Date(2022, 12, 27)],
//       imageSrc: "/Event_16.jpeg",
//     },

//     {
//       title: "End of the line",
//       text: "Het is niet al goud wat blinkt. Loopt alles goed af met Damon, Jowie en de vriendengroep? \nKom kijken, ontdek en geniet van het laatste deel van onze trilogie. \nEen spannend verhaal vol humor, straffe choreo en bekende muziek.\n\nHeb je het 1e en 2e deel niet gezien? Geen probleem, wij nemen je mee in een uniek verhaal waarin alles duidelijk wordt, zelf zonder voorkennis.",
//       dates: [new Date(2024, 10, 31), new Date(2024, 11, 1)],
//       imageSrc: "/Event_3.jpg  ",
//     },
//   ],
// };
