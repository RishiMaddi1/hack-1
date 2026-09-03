import { PayOrderClient } from "@/components/PayOrderClient";

export default async function PayOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <PayOrderClient orderId={decodeURIComponent(orderId)} />;
}
