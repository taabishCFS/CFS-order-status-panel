// Legacy site map from orderdetailadd_a.php ($siteMap). eBay orders send as Furntastic, as in the legacy script.
// The legacy logo helper resolves to this one CFS logo for every site (its $CDN_URL is never set); staff can change it per site later.
const LOGO = "https://www.choicefurnituresuperstore.co.uk/img/brand/Choice-Obsedian.png";

const site = (code, name, domain, phone, fromName, deliveriesFromName) => ({
  code,
  name,
  url: `https://www.${domain}/`,
  serviceEmail: `customerservice@${domain.replace("choicefurnituresuperstore", "cfsonline")}`,
  deliveriesEmail: `deliveries@${domain.replace("choicefurnituresuperstore", "cfsonline")}`,
  accountsEmail: `accounts@${domain.replace("choicefurnituresuperstore", "cfsonline")}`,
  phone,
  fromName,
  deliveriesFromName,
  logoUrl: LOGO,
});

export const SITES = [
  site("CFS", "Choice Furniture Superstore", "choicefurnituresuperstore.co.uk", "0116-296-3800", "Customer Service CFS UK", "Deliveries CFS UK"),
  site("TFS", "The Furnshop", "thefurnshop.co.uk", "0116-296-2565", "Customer Service The Furnshop UK", "Deliveries The Furnshop UK"),
  site("FURN", "Furntastic", "furntastic.co.uk", "0116-296-4432", "Customer Service Furntastic UK", "Deliveries Furntastic UK"),
  site("eBay", "Furntastic", "furntastic.co.uk", "0116-296-4432", "Customer Service Furntastic UK", "Deliveries Furntastic UK"),
  site("UD", "Urbandeco", "urbandeco.co.uk", "0116-296-4432", "Customer Service Urbandeco UK", "Deliveries Urbandeco UK"),
  site("MM", "Mirroredmobel", "mirroredmobel.co.uk", "0116-296-4432", "Customer Service Mirroredmobel UK", "Deliveries Mirroredmobel UK"),
];

export const DEFAULT_SITE_CODE = "CFS";
