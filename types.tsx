export interface Event {
  uuid: string; // Unique identifier for each event
  title: string; // Title of the event
  dates: EventDateEntry[]; // List of date entries
  description: string; // Event description
  mainImage: string; // Main image for the event
  images?: string[]; // Additional images for the event
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

export interface EventHighlight {
  uuid: string;
  event_uuid: string;
  valid_date: string;
}
