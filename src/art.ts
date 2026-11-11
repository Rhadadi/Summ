// Public-domain paintings from Wikimedia Commons, shown as backdrops. Credits appear beside each one.
export interface Art{file:string;artist:string;title:string;year:string;position:string}
export const art:Record<string,Art>={
 hokusai:{file:'hokusai.jpg',artist:'Katsushika Hokusai',title:'The Great Wave off Kanagawa',year:'c. 1831',position:'50% 45%'},
 vangogh:{file:'vangogh.jpg',artist:'Vincent van Gogh',title:'The Starry Night',year:'1889',position:'50% 38%'},
 monet:{file:'monet.jpg',artist:'Claude Monet',title:'Impression, Sunrise',year:'1872',position:'50% 55%'},
 friedrich:{file:'friedrich.jpg',artist:'Caspar David Friedrich',title:'Wanderer above the Sea of Fog',year:'c. 1818',position:'50% 28%'},
 hammershoi:{file:'hammershoi.jpg',artist:'Vilhelm Hammershøi',title:'Interior, Sunlight on the Floor',year:'1906',position:'50% 62%'},
 vermeer:{file:'vermeer.jpg',artist:'Johannes Vermeer',title:'Girl Reading a Letter at an Open Window',year:'c. 1659',position:'50% 30%'},
 layla:{file:'layla.jpg',artist:'Yar Muhammad al-Haravi',title:'Laylá and Majnun at School',year:'1516',position:'50% 38%'},
 spitzweg:{file:'spitzweg.jpg',artist:'Carl Spitzweg',title:'The Bookworm',year:'c. 1850',position:'50% 35%'},
};
export const artUrl=(a:Art)=>import.meta.env.BASE_URL+'art/'+a.file;
// Slides take paintings in turn so neighbouring books never share one.
export const rotation:Art[]=[art.vangogh,art.monet,art.friedrich,art.vermeer,art.hokusai,art.hammershoi];
