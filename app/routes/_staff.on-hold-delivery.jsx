import OrdersByBrand from "../ui/OrdersByBrand.jsx";

// The old "On Hold Delivery" menu item is Orders by Brand filtered to the On Hold Delivery status (62).
export default function OnHoldDelivery() {
  return <OrdersByBrand initialStatusId={62} title="On Hold Delivery" />;
}
