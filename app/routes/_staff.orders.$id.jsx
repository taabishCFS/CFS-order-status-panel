import { useParams } from "react-router";
import OrderDetailPage from "../ui/OrderDetailPage.jsx";

export default function OrderRoute() {
  const { id } = useParams();
  return <OrderDetailPage id={id} />;
}
