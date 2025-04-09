export interface DbObject {
  uuid: string;
  created_at: string; // Date of the object creation
  updated_at?: string; //Date of last update
  created_by?: string; // User who created the object
  type: string; // Type of the object (e.g., event, post, etc.)
}

//Event types
export interface Event extends DbObject {
  title: string; // Title of the event
  description: string; // Event description
  mainImage: string; // Main image for the event
  images?: string[]; // Additional images for the event
  dates: EventDateEntry[]; // List of date entries
  eventLocation?: EventLocation; // Location details of the event
}

export interface EventLocation {
  country: string; // Country of the event
  city: string; // City of the event
  street: string; // Street address
  location?: string; // Name of the venue
}

export interface EventDateEntry {
  uuid: string; // Unique identifier for each date entry
  start: string; // ISO date string
  end: string; // ISO date string
  timeLine: TimeLineEntry[];
  price?: number; //undefined if free
  external_link?: string;
}

export interface TimeLineEntry {
  time: string;
  description: string;
}

//Highlight type
export interface EventHighlight {
  uuid: string;
  event_uuid: string;
  valid_date: string;
}

//About types
export interface TeamMember extends DbObject {
  name: string;
  role: string;
  image: string;
  email?: string;
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;
  website?: string;
}

export interface Partner extends DbObject {
  name: string;
  logo: string;
  description: string;
}
