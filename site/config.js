/**
 * Site settings.
 *
 * The calendar comes from calendar.json, which a GitHub Action rebuilds every 10 minutes
 * from Apple Calendar. The private iCloud links live in the repository's Actions secrets
 * (ICS_URL, UNAVAILABLE_ICS_URL, PROVISIONAL_ICS_URL), never in this public file.
 *
 * Enquiries are posted to Joey's private agent, which forwards them to Telegram.
 * If that can't be reached, the visitor's email app opens instead.
 */
window.AVAILABILITY_CONFIG = {
  displayName: "Joey Farren",
  tagline: "Booking availability",
  contactEmail: "joey@farrenav.co.uk",
  calendarDataUrl: "calendar.json",
  enquiryUrl: "https://agent.farrenav.co.uk/hooks/enquiry",
  icsUrl: "",
  unavailableIcsUrl: "",
  provisionalIcsUrl: "",
  corsProxy: "",
};
