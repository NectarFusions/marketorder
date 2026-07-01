import React, { useState, useEffect, useCallback } from "react";
import {
  MapPin, Clock, Check, ChevronRight, ChevronLeft, Plus, Minus,
  Settings, Lock, Calendar, Trash2, ClipboardList, AlertCircle,
  Sparkles, Info, X, Hexagon, PartyPopper, ShoppingBasket
} from "lucide-react";
import { supabase } from "./supabaseClient";

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant:ital,wght@0,500;0,600;0,700;1,500&family=Manrope:wght@400;500;600;700;800&display=swap');
`;

// ---- Brand ----
const COLORS = {
  bg: "#0B0A08",
  panel: "#221D14",
  panelLight: "#2C2519",
  gold: "#FFCB3D",
  blue: "#5CB3EA",
  orange: "#F6963E",
  red: "#EB5A42",
  cream: "#FBF6EA",
  muted: "#D3C9B7",
};

// ---- Sizes & pricing ----
const PRICE_4OZ = 7;
const DEAL_QTY_4OZ = 3;
const DEAL_PRICE_4OZ = 20;
const PRICE_7OZ = 12;
const PRICE_1LB = 20;
const HALFGAL_PLAIN = 50;
const HALFGAL_INFUSED = 60;
const PLAIN_FLAVOR_NAME = "Natural Raw Unfiltered Michigan Honey";

// Formspree forwards order & event-request emails to info@nectar-fusions.com.
// Create a free form at https://formspree.io and paste the endpoint below.
const FORMSPREE_ENDPOINT = "https://formspree.io/f/xlgyppke";
const ADMIN_PASSCODE = "nectarfusions"; // change this, then rebuild/redeploy

const SIZES = [
  { id: "4oz", label: "4 oz Jar", blurb: "Perfect for trying a few flavors at once.", dealEligible: true },
  { id: "7oz", label: "7 oz Jar", blurb: "Our most popular everyday size.", price: PRICE_7OZ },
  { id: "1lb", label: "1 lb Jar", blurb: "For the honey lovers in the house.", price: PRICE_1LB },
  { id: "halfgallon", label: "Half Gallon", blurb: "Big batches for big honey needs.", isHalfGallon: true },
];

const HONEY_TYPES = [
  { id: "regular", label: "Regular (Liquid)", blurb: "Raw and pourable — great for tea, baking, and drizzling." },
  { id: "spun", label: "Spun (Creamed)", blurb: "Whipped smooth and thick, like nut butter — spreads on toast without dripping." },
];

function uid() {
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function fmtTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function generateSlots(market) {
  const slots = [];
  let [h, m] = market.startTime.split(":").map(Number);
  const [endH, endM] = market.endTime.split(":").map(Number);
  const interval = Number(market.slotMinutes) || 15;
  while (h < endH || (h === endH && m < endM)) {
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += interval;
    while (m >= 60) { m -= 60; h += 1; }
  }
  return slots;
}

function unitPrice(sizeId, flavorName) {
  if (sizeId === "4oz") return PRICE_4OZ;
  if (sizeId === "7oz") return PRICE_7OZ;
  if (sizeId === "1lb") return PRICE_1LB;
  if (sizeId === "halfgallon") return flavorName === PLAIN_FLAVOR_NAME ? HALFGAL_PLAIN : HALFGAL_INFUSED;
  return 0;
}

function computeCartTotal(cart) {
  const qty4oz = cart.filter((i) => i.sizeId === "4oz").reduce((a, i) => a + i.qty, 0);
  const deals = Math.floor(qty4oz / DEAL_QTY_4OZ);
  const remainder4oz = qty4oz % DEAL_QTY_4OZ;
  const total4oz = deals * DEAL_PRICE_4OZ + remainder4oz * PRICE_4OZ;
  const totalOther = cart
    .filter((i) => i.sizeId !== "4oz")
    .reduce((sum, i) => sum + unitPrice(i.sizeId, i.flavorName) * i.qty, 0);
  return total4oz + totalOther;
}

// ---- Supabase row <-> app object mapping ----
function marketFromRow(row) {
  return {
    id: row.id, name: row.name, address: row.address || "", date: row.date,
    startTime: row.start_time, endTime: row.end_time, slotMinutes: row.slot_minutes,
    capacityPerSlot: row.capacity_per_slot, bookings: row.bookings || {},
  };
}
function flavorFromRow(row) {
  return {
    id: row.id, name: row.name, category: row.category,
    featured: row.featured, active: row.active, sortOrder: row.sort_order,
  };
}
function orderFromRow(row) {
  return {
    id: row.id, items: row.items, total: Number(row.total),
    marketId: row.market_id, marketName: row.market_name, marketAddress: row.market_address,
    marketDate: row.market_date, slot: row.slot,
    firstName: row.first_name, lastName: row.last_name, email: row.email, phone: row.phone,
    notes: row.notes || "", pickedUp: row.picked_up, createdAt: row.created_at,
  };
}
function eventRequestFromRow(row) {
  return {
    id: row.id, eventDate: row.event_date, eventType: row.event_type,
    quantityEstimate: row.quantity_estimate, preferredSizes: row.preferred_sizes,
    preferredFlavors: row.preferred_flavors, budgetNote: row.budget_note,
    firstName: row.first_name, lastName: row.last_name, email: row.email, phone: row.phone,
    notes: row.notes || "", status: row.status, createdAt: row.created_at,
  };
}

export default function App() {
  const [view, setView] = useState("order"); // order | admin
  const [orderType, setOrderType] = useState(null); // 'pickup' | 'event'
  const [step, setStep] = useState(0);

  const [markets, setMarkets] = useState([]);
  const [flavors, setFlavors] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  // builder state
  const [builderSize, setBuilderSize] = useState("4oz");
  const [builderType, setBuilderType] = useState("regular");
  const [builderFlavorId, setBuilderFlavorId] = useState(null);
  const [builderQty, setBuilderQty] = useState(1);
  const [cart, setCart] = useState([]);
  const [showUpsell, setShowUpsell] = useState(false);
  const [upsellShown, setUpsellShown] = useState(false);
  const [showTypeInfo, setShowTypeInfo] = useState(false);

  const [selectedMarketId, setSelectedMarketId] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [customer, setCustomer] = useState({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // event request state
  const [eventForm, setEventForm] = useState({
    eventDate: "", eventType: "", quantityEstimate: "", preferredSizes: "",
    preferredFlavors: "", budgetNote: "", firstName: "", lastName: "", email: "", phone: "", notes: "",
  });
  const [submittingEvent, setSubmittingEvent] = useState(false);
  const [eventError, setEventError] = useState("");
  const [confirmedEvent, setConfirmedEvent] = useState(false);

  // admin state
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [adminTab, setAdminTab] = useState("markets");
  const [orders, setOrders] = useState([]);
  const [eventRequests, setEventRequests] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [newMarket, setNewMarket] = useState({
    name: "", address: "", date: "", startTime: "09:00", endTime: "13:00",
    slotMinutes: 15, capacityPerSlot: 3,
  });
  const [addingMarket, setAddingMarket] = useState(false);
  const [marketError, setMarketError] = useState("");
  const [newFlavor, setNewFlavor] = useState({ name: "", category: "seasonal", featured: false });
  const [addingFlavor, setAddingFlavor] = useState(false);
  const [flavorError, setFlavorError] = useState("");

  const loadMarkets = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("markets").select("*").gte("date", today)
        .order("date", { ascending: true }).order("start_time", { ascending: true });
      if (error) throw error;
      setMarkets((data || []).map(marketFromRow));
    } catch (e) { console.error("Failed to load markets:", e); setMarkets([]); }
  }, []);

  const loadFlavors = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("flavors").select("*").eq("active", true)
        .order("featured", { ascending: false }).order("sort_order", { ascending: true });
      if (error) throw error;
      setFlavors((data || []).map(flavorFromRow));
    } catch (e) { console.error("Failed to load flavors:", e); setFlavors([]); }
  }, []);

  const loadAllFlavorsAdmin = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("flavors").select("*")
        .order("category", { ascending: true }).order("sort_order", { ascending: true });
      if (error) throw error;
      setFlavors((data || []).map(flavorFromRow));
    } catch (e) { console.error("Failed to load flavors:", e); }
  }, []);

  useEffect(() => {
    (async () => { setLoadingData(true); await Promise.all([loadMarkets(), loadFlavors()]); setLoadingData(false); })();
  }, [loadMarkets, loadFlavors]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase.from("orders").select("*")
        .order("market_date", { ascending: true }).order("slot", { ascending: true });
      if (error) throw error;
      setOrders((data || []).map(orderFromRow));
    } catch (e) { console.error(e); setOrders([]); }
    setLoadingOrders(false);
  }, []);

  const loadEventRequests = useCallback(async () => {
    try {
      const { data, error } = await supabase.from("event_requests").select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setEventRequests((data || []).map(eventRequestFromRow));
    } catch (e) { console.error(e); setEventRequests([]); }
  }, []);

  useEffect(() => {
    if (view !== "admin" || !adminUnlocked) return;
    if (adminTab === "orders") loadOrders();
    if (adminTab === "events") loadEventRequests();
    if (adminTab === "flavors") loadAllFlavorsAdmin();
  }, [view, adminUnlocked, adminTab, loadOrders, loadEventRequests, loadAllFlavorsAdmin]);

  const featuredFlavors = flavors.filter((f) => f.featured);
  const coreFlavors = flavors.filter((f) => !f.featured && f.category === "core");
  const seasonalFlavors = flavors.filter((f) => !f.featured && f.category === "seasonal");
  const builderFlavor = flavors.find((f) => f.id === builderFlavorId);
  const cartTotal = computeCartTotal(cart);
  const qty4ozInCart = cart.filter((i) => i.sizeId === "4oz").reduce((a, i) => a + i.qty, 0);
  const selectedMarket = markets.find((m) => m.id === selectedMarketId);

  function addToCart() {
    if (!builderFlavor) return;
    const unit = unitPrice(builderSize, builderFlavor.name);
    const item = {
      lineId: uid(), sizeId: builderSize, sizeLabel: SIZES.find((s) => s.id === builderSize)?.label,
      flavorId: builderFlavor.id, flavorName: builderFlavor.name, honeyType: builderType, qty: builderQty,
      unitPrice: unit,
    };
    setCart((c) => [...c, item]);
    setBuilderQty(1);
    if (builderSize === "4oz" && !upsellShown) {
      const newQty4oz = qty4ozInCart + builderQty;
      if (newQty4oz > 0 && newQty4oz < DEAL_QTY_4OZ) {
        setShowUpsell(true);
        setUpsellShown(true);
      }
    }
  }

  function removeFromCart(lineId) {
    setCart((c) => c.filter((i) => i.lineId !== lineId));
  }

  function addUpsellJars(count) {
    if (!builderFlavor) return;
    const unit = unitPrice("4oz", builderFlavor.name);
    setCart((c) => [...c, {
      lineId: uid(), sizeId: "4oz", sizeLabel: "4 oz Jar",
      flavorId: builderFlavor.id, flavorName: builderFlavor.name, honeyType: builderType, qty: count,
      unitPrice: unit,
    }]);
    setShowUpsell(false);
  }

  async function placeOrder() {
    setErrorMsg("");
    if (!selectedMarket || !selectedSlot) { setErrorMsg("Pick a market and a pickup time first."); return; }
    if (!customer.firstName.trim() || !customer.lastName.trim() || !customer.email.trim() || !customer.phone.trim()) {
      setErrorMsg("We need your name, email, and phone number to hold your order."); return;
    }
    setSubmitting(true);
    try {
      const { data: freshRow, error: fetchErr } = await supabase
        .from("markets").select("*").eq("id", selectedMarket.id).single();
      if (fetchErr) throw fetchErr;
      const marketNow = marketFromRow(freshRow);
      const bookings = { ...(marketNow.bookings || {}) };
      const booked = bookings[selectedSlot] || 0;
      if (booked >= marketNow.capacityPerSlot) {
        setErrorMsg("Sorry, that pickup time just filled up. Pick another time.");
        setSubmitting(false); loadMarkets(); return;
      }
      bookings[selectedSlot] = booked + 1;
      const { error: updateErr } = await supabase.from("markets").update({ bookings }).eq("id", marketNow.id);
      if (updateErr) throw updateErr;

      const order = {
        id: uid(), items: cart, total: cartTotal,
        marketId: marketNow.id, marketName: marketNow.name, marketAddress: marketNow.address,
        marketDate: marketNow.date, slot: selectedSlot,
        firstName: customer.firstName.trim(), lastName: customer.lastName.trim(),
        email: customer.email.trim(), phone: customer.phone.trim(), notes: customer.notes.trim(),
        pickedUp: false, createdAt: new Date().toISOString(),
      };
      const { error: insertErr } = await supabase.from("orders").insert({
        id: order.id, items: order.items, total: order.total,
        market_id: order.marketId, market_name: order.marketName, market_address: order.marketAddress,
        market_date: order.marketDate, slot: order.slot,
        first_name: order.firstName, last_name: order.lastName, email: order.email, phone: order.phone,
        notes: order.notes, picked_up: false,
      });
      if (insertErr) throw insertErr;

      if (FORMSPREE_ENDPOINT) {
        try {
          const itemsSummary = order.items.map((i) =>
            `${i.qty}x ${i.sizeLabel} ${i.flavorName} (${i.honeyType === "spun" ? "Spun" : "Regular"})`
          ).join(", ");
          await fetch(FORMSPREE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              _subject: `New NectarFusions order — ${order.firstName} ${order.lastName}`,
              orderId: order.id,
              customerName: `${order.firstName} ${order.lastName}`,
              customerEmail: order.email, customerPhone: order.phone,
              market: `${order.marketName} (${order.marketAddress || "no address set"})`,
              pickupDate: order.marketDate, pickupTime: order.slot,
              items: itemsSummary, total: `$${order.total.toFixed(2)}`,
              notes: order.notes || "(none)",
            }),
          });
        } catch (emailErr) { console.warn("Order email failed:", emailErr); }
      }
      setConfirmedOrder(order);
      setStep(5);
    } catch (e) {
      console.error("placeOrder failed:", e);
      setErrorMsg("Something went wrong saving your order. Give it another try.");
    }
    setSubmitting(false);
  }

  async function submitEventRequest() {
    setEventError("");
    if (!eventForm.firstName.trim() || !eventForm.lastName.trim() || !eventForm.email.trim() || !eventForm.phone.trim()) {
      setEventError("We need your name, email, and phone so we can follow up.");
      return;
    }
    setSubmittingEvent(true);
    try {
      const id = uid();
      const { error } = await supabase.from("event_requests").insert({
        id, event_date: eventForm.eventDate || null, event_type: eventForm.eventType.trim(),
        quantity_estimate: eventForm.quantityEstimate.trim(), preferred_sizes: eventForm.preferredSizes.trim(),
        preferred_flavors: eventForm.preferredFlavors.trim(), budget_note: eventForm.budgetNote.trim(),
        first_name: eventForm.firstName.trim(), last_name: eventForm.lastName.trim(),
        email: eventForm.email.trim(), phone: eventForm.phone.trim(), notes: eventForm.notes.trim(),
        status: "new",
      });
      if (error) throw error;

      if (FORMSPREE_ENDPOINT) {
        try {
          await fetch(FORMSPREE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              _subject: `Special event request — ${eventForm.firstName} ${eventForm.lastName}`,
              requestId: id,
              customerName: `${eventForm.firstName} ${eventForm.lastName}`,
              customerEmail: eventForm.email, customerPhone: eventForm.phone,
              eventDate: eventForm.eventDate || "(not specified)",
              eventType: eventForm.eventType || "(not specified)",
              quantityEstimate: eventForm.quantityEstimate || "(not specified)",
              preferredSizes: eventForm.preferredSizes || "(no preference)",
              preferredFlavors: eventForm.preferredFlavors || "(no preference)",
              budgetNote: eventForm.budgetNote || "(none)",
              notes: eventForm.notes || "(none)",
            }),
          });
        } catch (emailErr) { console.warn("Event request email failed:", emailErr); }
      }
      setConfirmedEvent(true);
    } catch (e) {
      console.error("submitEventRequest failed:", e);
      setEventError("Something went wrong sending your request. Give it another try.");
    }
    setSubmittingEvent(false);
  }

  function resetAll() {
    setOrderType(null); setStep(0);
    setCart([]); setUpsellShown(false); setShowUpsell(false);
    setBuilderSize("4oz"); setBuilderType("regular"); setBuilderFlavorId(null); setBuilderQty(1);
    setSelectedMarketId(null); setSelectedSlot(null);
    setCustomer({ firstName: "", lastName: "", email: "", phone: "", notes: "" });
    setConfirmedOrder(null); setErrorMsg("");
    setEventForm({ eventDate: "", eventType: "", quantityEstimate: "", preferredSizes: "",
      preferredFlavors: "", budgetNote: "", firstName: "", lastName: "", email: "", phone: "", notes: "" });
    setConfirmedEvent(false); setEventError("");
    loadMarkets(); loadFlavors();
  }

  async function addMarket() {
    setMarketError("");
    if (!newMarket.name.trim()) { setMarketError("Give the market a name."); return; }
    if (!newMarket.date) { setMarketError("Pick a date."); return; }
    if (!newMarket.startTime || !newMarket.endTime) { setMarketError("Set a start and end time."); return; }
    if (newMarket.startTime >= newMarket.endTime) { setMarketError("End time has to be after start time."); return; }
    setAddingMarket(true);
    try {
      const { error } = await supabase.from("markets").insert({
        id: uid(), name: newMarket.name.trim(), address: newMarket.address.trim(), date: newMarket.date,
        start_time: newMarket.startTime, end_time: newMarket.endTime,
        slot_minutes: Number(newMarket.slotMinutes) || 15, capacity_per_slot: Number(newMarket.capacityPerSlot) || 1,
        bookings: {},
      });
      if (error) throw error;
      setNewMarket({ name: "", address: "", date: "", startTime: "09:00", endTime: "13:00", slotMinutes: 15, capacityPerSlot: 3 });
      await loadMarkets();
    } catch (e) {
      setMarketError("Couldn't save that market: " + (e?.message || "unknown error") + ". Try again.");
    }
    setAddingMarket(false);
  }

  async function deleteMarket(id) {
    try { await supabase.from("markets").delete().eq("id", id); loadMarkets(); }
    catch (e) { console.error(e); }
  }

  async function togglePickedUp(order) {
    try {
      await supabase.from("orders").update({ picked_up: !order.pickedUp }).eq("id", order.id);
      setOrders((os) => os.map((o) => (o.id === order.id ? { ...o, pickedUp: !o.pickedUp } : o)));
    } catch (e) { console.error(e); }
  }

  async function setEventStatus(req, status) {
    try {
      await supabase.from("event_requests").update({ status }).eq("id", req.id);
      setEventRequests((rs) => rs.map((r) => (r.id === req.id ? { ...r, status } : r)));
    } catch (e) { console.error(e); }
  }

  async function addFlavor() {
    setFlavorError("");
    if (!newFlavor.name.trim()) { setFlavorError("Give the flavor a name."); return; }
    setAddingFlavor(true);
    try {
      const { error } = await supabase.from("flavors").insert({
        id: uid(), name: newFlavor.name.trim(), category: newFlavor.category,
        featured: newFlavor.featured, active: true, sort_order: 99,
      });
      if (error) throw error;
      setNewFlavor({ name: "", category: "seasonal", featured: false });
      await loadAllFlavorsAdmin();
    } catch (e) {
      setFlavorError("Couldn't save that flavor: " + (e?.message || "unknown error") + ". Try again.");
    }
    setAddingFlavor(false);
  }

  async function toggleFlavorField(flavor, field) {
    try {
      const value = !flavor[field];
      const column = field === "featured" ? "featured" : field === "active" ? "active" : field;
      await supabase.from("flavors").update({ [column]: value }).eq("id", flavor.id);
      await loadAllFlavorsAdmin();
    } catch (e) { console.error(e); }
  }

  async function deleteFlavor(id) {
    try { await supabase.from("flavors").delete().eq("id", id); loadAllFlavorsAdmin(); }
    catch (e) { console.error(e); }
  }

  const eyebrow = { fontFamily: "Manrope", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", fontSize: 13, color: COLORS.gold };
  const display = { fontFamily: "Cormorant" };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "Manrope, sans-serif", color: COLORS.cream }}>
      <style>{FONTS}</style>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; }
        button { font-family: inherit; cursor: pointer; }
        input, select, textarea { font-family: inherit; }
        ::placeholder { color: #6b6255; }
        .hexbadge { position: relative; }
        @media (prefers-reduced-motion: no-preference) {
          .fade-in { animation: fadeIn 0.25s ease both; }
        }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.92) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      `}</style>

      {/* Header */}
      <div style={{ background: `linear-gradient(180deg, ${COLORS.panel}, ${COLORS.bg})`, borderBottom: `1px solid #3a331f`, padding: "22px 20px" }}>
        <div style={{ maxWidth: 500, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ ...display, fontWeight: 700, fontSize: 26, letterSpacing: "0.02em", color: COLORS.cream }}>NectarFusions</div>
            <div style={{ fontSize: 13, letterSpacing: "0.1em", color: COLORS.gold, marginTop: 2, textTransform: "uppercase" }}>
              Nature's Happiness <span style={{ color: COLORS.muted }}>|</span> Honey Infused
            </div>
          </div>
          <button onClick={() => setView(view === "order" ? "admin" : "order")}
            style={{ background: "none", border: "none", color: COLORS.muted, padding: 6 }} aria-label="Vendor login">
            <Settings size={18} />
          </button>
        </div>
      </div>

      {view === "order" ? (
        <OrderFlow
          orderType={orderType} setOrderType={setOrderType} step={step} setStep={setStep}
          markets={markets} flavors={flavors} loadingData={loadingData}
          featuredFlavors={featuredFlavors} coreFlavors={coreFlavors} seasonalFlavors={seasonalFlavors}
          builderSize={builderSize} setBuilderSize={setBuilderSize}
          builderType={builderType} setBuilderType={setBuilderType}
          builderFlavorId={builderFlavorId} setBuilderFlavorId={setBuilderFlavorId}
          builderQty={builderQty} setBuilderQty={setBuilderQty}
          builderFlavor={builderFlavor} addToCart={addToCart} cart={cart} removeFromCart={removeFromCart}
          cartTotal={cartTotal} qty4ozInCart={qty4ozInCart}
          showUpsell={showUpsell} setShowUpsell={setShowUpsell} addUpsellJars={addUpsellJars}
          showTypeInfo={showTypeInfo} setShowTypeInfo={setShowTypeInfo}
          selectedMarketId={selectedMarketId} setSelectedMarketId={setSelectedMarketId}
          selectedSlot={selectedSlot} setSelectedSlot={setSelectedSlot} selectedMarket={selectedMarket}
          customer={customer} setCustomer={setCustomer} submitting={submitting} errorMsg={errorMsg}
          placeOrder={placeOrder} confirmedOrder={confirmedOrder} resetAll={resetAll}
          eventForm={eventForm} setEventForm={setEventForm} submittingEvent={submittingEvent}
          eventError={eventError} submitEventRequest={submitEventRequest} confirmedEvent={confirmedEvent}
          eyebrow={eyebrow} display={display}
        />
      ) : (
        <AdminPanel
          unlocked={adminUnlocked} setUnlocked={setAdminUnlocked}
          passcodeInput={passcodeInput} setPasscodeInput={setPasscodeInput}
          adminTab={adminTab} setAdminTab={setAdminTab}
          markets={markets} addMarket={addMarket} deleteMarket={deleteMarket}
          newMarket={newMarket} setNewMarket={setNewMarket} addingMarket={addingMarket} marketError={marketError}
          orders={orders} loadingOrders={loadingOrders} togglePickedUp={togglePickedUp}
          eventRequests={eventRequests} setEventStatus={setEventStatus}
          flavors={flavors} newFlavor={newFlavor} setNewFlavor={setNewFlavor}
          addFlavor={addFlavor} addingFlavor={addingFlavor} flavorError={flavorError}
          toggleFlavorField={toggleFlavorField} deleteFlavor={deleteFlavor}
          eyebrow={eyebrow} display={display}
        />
      )}
    </div>
  );
}

const primaryBtnStyle = {
  background: COLORS.gold, color: "#000000", border: "none", borderRadius: 10,
  padding: "14px 18px", fontWeight: 800, fontSize: 17,
};
const secondaryBtnStyle = {
  background: "transparent", color: COLORS.cream, border: `1px solid #5a4f33`, borderRadius: 10,
  padding: "12px 16px", fontWeight: 700, fontSize: 16,
};
const qtyBtnStyle = {
  width: 34, height: 34, borderRadius: "50%", border: `1px solid #5a4f33`,
  background: COLORS.panelLight, color: COLORS.cream, display: "flex", alignItems: "center", justifyContent: "center",
};
const inputStyle = {
  width: "100%", padding: "12px 13px", borderRadius: 8, border: `1px solid #5a4f33`,
  fontSize: 16, background: COLORS.panelLight, color: COLORS.cream,
};
const cardStyle = { background: COLORS.panel, borderRadius: 12, padding: 16, border: "1px solid #3a331f" };

function StepDots({ step, total = 5 }) {
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "14px 0" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i + 1 === step ? 22 : 8, height: 8, borderRadius: 4,
          background: i + 1 <= step ? COLORS.gold : "#3a331f", transition: "all 0.2s",
        }} />
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5, color: COLORS.muted }}>{label}</div>
      {children}
    </div>
  );
}

function EmptyNote({ text }) {
  return (
    <div style={{ background: "#00000022", borderRadius: 10, padding: 16, fontSize: 15, color: COLORS.muted, textAlign: "center" }}>
      {text}
    </div>
  );
}

function BackRow({ onClick }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 4, padding: "4px 0 10px", color: COLORS.muted, fontWeight: 600, fontSize: 15 }}>
      <ChevronLeft size={16} /> Back
    </button>
  );
}

function NextBar({ onClick, disabled, label }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...primaryBtnStyle, width: "100%", marginTop: 18, opacity: disabled ? 0.4 : 1,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    }}>
      {label} <ChevronRight size={16} />
    </button>
  );
}

function FlavorGroup({ title, items, builderFlavorId, setBuilderFlavorId, icon }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.muted, marginBottom: 6 }}>
        {icon} {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {items.map((f) => (
          <button key={f.id} onClick={() => setBuilderFlavorId(f.id)} style={{
            padding: "8px 14px", borderRadius: 20, fontSize: 15, fontWeight: 700,
            border: builderFlavorId === f.id ? `1px solid ${COLORS.gold}` : "1px solid #3a331f",
            background: builderFlavorId === f.id ? COLORS.gold : COLORS.panelLight,
            color: builderFlavorId === f.id ? "#000000" : COLORS.cream,
          }}>
            {f.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function OrderFlow(props) {
  const {
    orderType, setOrderType, step, setStep, markets, flavors, loadingData,
    featuredFlavors, coreFlavors, seasonalFlavors,
    builderSize, setBuilderSize, builderType, setBuilderType,
    builderFlavorId, setBuilderFlavorId, builderQty, setBuilderQty,
    builderFlavor, addToCart, cart, removeFromCart, cartTotal, qty4ozInCart,
    showUpsell, setShowUpsell, addUpsellJars, showTypeInfo, setShowTypeInfo,
    selectedMarketId, setSelectedMarketId, selectedSlot, setSelectedSlot, selectedMarket,
    customer, setCustomer, submitting, errorMsg, placeOrder, confirmedOrder, resetAll,
    eventForm, setEventForm, submittingEvent, eventError, submitEventRequest, confirmedEvent,
    eyebrow, display,
  } = props;

  const currentUnitPrice = builderFlavor ? unitPrice(builderSize, builderFlavor.name) : 0;
  const sizeMeta = SIZES.find((s) => s.id === builderSize);

  // ---- Step 0: choose order type ----
  if (step === 0) {
    return (
      <div style={{ maxWidth: 500, margin: "0 auto", padding: "28px 16px 60px" }} className="fade-in">
        <div style={{ ...display, fontSize: 32, fontWeight: 600, textAlign: "center", marginBottom: 6 }}>What can we get you?</div>
        <div style={{ textAlign: "center", color: COLORS.muted, fontSize: 16, marginBottom: 24 }}>Raw Michigan honey, infused with real flavor.</div>

        <button onClick={() => { setOrderType("pickup"); setStep(1); }} style={{
          ...cardStyle, width: "100%", textAlign: "left", marginBottom: 14, display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <ShoppingBasket size={26} color={COLORS.gold} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ ...display, fontWeight: 700, fontSize: 21 }}>Order for Pickup</div>
            <div style={{ fontSize: 15, color: COLORS.muted, marginTop: 4, lineHeight: 1.5 }}>
              Build your order, pick a market, and reserve a pickup time. Pay cash or card when you arrive.
            </div>
          </div>
        </button>

        <button onClick={() => { setOrderType("event"); setStep(1); }} style={{
          ...cardStyle, width: "100%", textAlign: "left", display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <PartyPopper size={26} color={COLORS.orange} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ ...display, fontWeight: 700, fontSize: 21 }}>Request Honey for an Event</div>
            <div style={{ fontSize: 15, color: COLORS.muted, marginTop: 4, lineHeight: 1.5 }}>
              Weddings, corporate gifts, big batches — tell us what you need and we'll follow up with a quote.
            </div>
          </div>
        </button>
      </div>
    );
  }

  // ============ EVENT REQUEST PATH ============
  if (orderType === "event") {
    if (confirmedEvent) {
      return (
        <div style={{ maxWidth: 500, margin: "0 auto", padding: "40px 16px 60px", textAlign: "center" }} className="fade-in">
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: COLORS.orange, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Check size={30} color="#000000" />
          </div>
          <div style={{ ...display, fontSize: 26, fontWeight: 700 }}>Got it, {eventForm.firstName}!</div>
          <div style={{ fontSize: 16, color: COLORS.muted, marginTop: 8, lineHeight: 1.6 }}>
            We'll review your event details and follow up at {eventForm.email} or {eventForm.phone} with a quote soon.
          </div>
          <button onClick={resetAll} style={{ ...primaryBtnStyle, marginTop: 24 }}>Back to start</button>
        </div>
      );
    }
    return (
      <div style={{ maxWidth: 500, margin: "0 auto", padding: "20px 16px 60px" }} className="fade-in">
        <BackRow onClick={() => { setOrderType(null); setStep(0); }} />
        <div style={eyebrow}>Special Event Request</div>
        <div style={{ ...display, fontSize: 28, fontWeight: 700, margin: "6px 0 16px" }}>Tell us about your event</div>

        <Field label="Event date (if known)">
          <input type="date" style={inputStyle} value={eventForm.eventDate} onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })} />
        </Field>
        <Field label="Event type">
          <input style={inputStyle} placeholder="Wedding, corporate gifts, party favors…" value={eventForm.eventType} onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })} />
        </Field>
        <Field label="How much honey do you think you'll need?">
          <input style={inputStyle} placeholder="e.g. 100 mini jars as favors" value={eventForm.quantityEstimate} onChange={(e) => setEventForm({ ...eventForm, quantityEstimate: e.target.value })} />
        </Field>
        <Field label="Preferred size(s)">
          <input style={inputStyle} placeholder="e.g. 4oz jars, or no preference" value={eventForm.preferredSizes} onChange={(e) => setEventForm({ ...eventForm, preferredSizes: e.target.value })} />
        </Field>
        <Field label="Preferred flavor(s)">
          <input style={inputStyle} placeholder="e.g. Lavender & vanilla, or no preference" value={eventForm.preferredFlavors} onChange={(e) => setEventForm({ ...eventForm, preferredFlavors: e.target.value })} />
        </Field>
        <Field label="Budget in mind (optional)">
          <input style={inputStyle} placeholder="e.g. around $300" value={eventForm.budgetNote} onChange={(e) => setEventForm({ ...eventForm, budgetNote: e.target.value })} />
        </Field>

        <div style={{ display: "flex", gap: 10 }}>
          <Field label="First name"><input style={inputStyle} value={eventForm.firstName} onChange={(e) => setEventForm({ ...eventForm, firstName: e.target.value })} placeholder="Jane" /></Field>
          <Field label="Last name"><input style={inputStyle} value={eventForm.lastName} onChange={(e) => setEventForm({ ...eventForm, lastName: e.target.value })} placeholder="Doe" /></Field>
        </div>
        <Field label="Email"><input type="email" style={inputStyle} value={eventForm.email} onChange={(e) => setEventForm({ ...eventForm, email: e.target.value })} placeholder="jane@email.com" /></Field>
        <Field label="Phone"><input type="tel" style={inputStyle} value={eventForm.phone} onChange={(e) => setEventForm({ ...eventForm, phone: e.target.value })} placeholder="(555) 555-5555" /></Field>
        <Field label="Anything else we should know?">
          <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={eventForm.notes} onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })} />
        </Field>

        {eventError && (
          <div style={{ display: "flex", gap: 8, background: "#3a1a14", color: "#ffb4a3", padding: 10, borderRadius: 8, fontSize: 15, marginTop: 6 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {eventError}
          </div>
        )}
        <NextBar onClick={submitEventRequest} disabled={submittingEvent} label={submittingEvent ? "Sending…" : "Send request"} />
      </div>
    );
  }

  // ============ PICKUP ORDER PATH ============
  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "20px 16px 60px", position: "relative" }}>
      {step <= 4 && <StepDots step={step} />}

      {/* Step 1: Build your order */}
      {step === 1 && (
        <div className="fade-in">
          <BackRow onClick={() => { setOrderType(null); setStep(0); }} />
          <div style={eyebrow}>Step 1 of 4 — Build your order</div>
          <div style={{ ...display, fontSize: 28, fontWeight: 700, margin: "6px 0 16px" }}>What are you taking home?</div>

          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.muted, marginBottom: 6 }}>Size</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {SIZES.map((s) => (
                <button key={s.id} onClick={() => setBuilderSize(s.id)} style={{
                  padding: "10px 8px", borderRadius: 8, textAlign: "left",
                  border: builderSize === s.id ? `1px solid ${COLORS.gold}` : "1px solid #3a331f",
                  background: builderSize === s.id ? "#2b2412" : COLORS.panelLight,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{s.label}</div>
                  <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>
                    {s.isHalfGallon ? "$50–$60" : s.dealEligible ? "$7 · 3 for $20" : `$${s.price}`}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 14, color: COLORS.muted, marginBottom: 14 }}>{sizeMeta?.blurb}</div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.muted }}>Honey type</div>
              <button onClick={() => setShowTypeInfo(true)} style={{ background: "none", border: "none", color: COLORS.blue, display: "flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 700 }}>
                <Info size={13} /> What's the difference?
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {HONEY_TYPES.map((t) => (
                <button key={t.id} onClick={() => setBuilderType(t.id)} style={{
                  flex: 1, padding: "10px 8px", borderRadius: 8, fontSize: 15, fontWeight: 700,
                  border: builderType === t.id ? `1px solid ${COLORS.gold}` : "1px solid #3a331f",
                  background: builderType === t.id ? "#2b2412" : COLORS.panelLight, color: COLORS.cream,
                }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.muted, marginBottom: 6 }}>Flavor</div>
            {loadingData && <div style={{ color: COLORS.muted, fontSize: 15 }}>Loading flavors…</div>}
            <FlavorGroup title="Featured" items={featuredFlavors} builderFlavorId={builderFlavorId} setBuilderFlavorId={setBuilderFlavorId} icon={<Sparkles size={12} />} />
            <FlavorGroup title="Our Core Six" items={coreFlavors} builderFlavorId={builderFlavorId} setBuilderFlavorId={setBuilderFlavorId} icon={<Hexagon size={12} />} />
            <FlavorGroup title="Seasonal Rotation" items={seasonalFlavors} builderFlavorId={builderFlavorId} setBuilderFlavorId={setBuilderFlavorId} icon={<Sparkles size={12} />} />
            {builderSize === "halfgallon" && builderFlavor && (
              <div style={{ fontSize: 14, color: COLORS.muted, marginTop: 4 }}>
                {builderFlavor.name === PLAIN_FLAVOR_NAME ? "Plain raw honey — $50" : "Infused — $60"}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setBuilderQty(Math.max(1, builderQty - 1))} style={qtyBtnStyle}><Minus size={14} /></button>
                <span style={{ minWidth: 18, textAlign: "center", fontWeight: 700 }}>{builderQty}</span>
                <button onClick={() => setBuilderQty(builderQty + 1)} style={qtyBtnStyle}><Plus size={14} /></button>
              </div>
              <button onClick={addToCart} disabled={!builderFlavor} style={{ ...primaryBtnStyle, opacity: builderFlavor ? 1 : 0.4 }}>
                Add {builderFlavor ? `— $${(currentUnitPrice * builderQty).toFixed(2)}` : ""}
              </button>
            </div>
          </div>

          {cart.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={eyebrow}>Your order so far</div>
              {cart.map((i) => (
                <div key={i.lineId} style={{ ...cardStyle, marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", padding: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{i.qty}× {i.sizeLabel} — {i.flavorName}</div>
                    <div style={{ fontSize: 14, color: COLORS.muted }}>{i.honeyType === "spun" ? "Spun" : "Regular"} · ${(i.unitPrice * i.qty).toFixed(2)}</div>
                  </div>
                  <button onClick={() => removeFromCart(i.lineId)} style={{ background: "none", border: "none", color: COLORS.red, padding: 4 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {qty4ozInCart > 0 && qty4ozInCart % DEAL_QTY_4OZ !== 0 && (
                <div style={{ fontSize: 14, color: COLORS.blue, marginTop: 8 }}>
                  Add {DEAL_QTY_4OZ - (qty4ozInCart % DEAL_QTY_4OZ)} more 4oz jar(s) to hit the next 3-for-$20 deal.
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontWeight: 800, fontSize: 18 }}>
                <span>Total</span><span style={{ color: COLORS.gold }}>${cartTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          <NextBar disabled={cart.length === 0} onClick={() => setStep(2)} label={cart.length > 0 ? "Continue to market" : "Add at least one item"} />
        </div>
      )}

      {/* Step 2: market */}
      {step === 2 && (
        <div className="fade-in">
          <BackRow onClick={() => setStep(1)} />
          <div style={eyebrow}>Step 2 of 4 — Pick your market</div>
          <div style={{ ...display, fontSize: 28, fontWeight: 700, margin: "6px 0 16px" }}>Where will you pick up?</div>
          {loadingData && <div style={{ color: COLORS.muted }}>Loading markets…</div>}
          {!loadingData && markets.length === 0 && <EmptyNote text="No markets scheduled yet. Check back soon!" />}
          {markets.map((m) => (
            <button key={m.id} onClick={() => { setSelectedMarketId(m.id); setSelectedSlot(null); }} style={{
              ...cardStyle, display: "block", width: "100%", textAlign: "left", marginBottom: 10,
              border: selectedMarketId === m.id ? `1px solid ${COLORS.gold}` : "1px solid #3a331f",
            }}>
              <div style={{ ...display, fontWeight: 700, fontSize: 19 }}>{m.name}</div>
              <div style={{ fontSize: 15, color: COLORS.muted, display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <Calendar size={13} /> {fmtDate(m.date)} · {fmtTime(m.startTime)}–{fmtTime(m.endTime)}
              </div>
              {m.address && <div style={{ fontSize: 15, color: COLORS.muted, display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}><MapPin size={13} /> {m.address}</div>}
            </button>
          ))}
          <NextBar disabled={!selectedMarketId} onClick={() => setStep(3)} label="Continue to pickup time" />
        </div>
      )}

      {/* Step 3: time slot */}
      {step === 3 && selectedMarket && (
        <div className="fade-in">
          <BackRow onClick={() => setStep(2)} />
          <div style={eyebrow}>Step 3 of 4 — Pick a time</div>
          <div style={{ ...display, fontSize: 28, fontWeight: 700, margin: "6px 0 4px" }}>When will you swing by?</div>
          <div style={{ fontSize: 15, color: COLORS.muted, marginBottom: 16 }}>{selectedMarket.name} · {fmtDate(selectedMarket.date)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {generateSlots(selectedMarket).map((slot) => {
              const booked = (selectedMarket.bookings || {})[slot] || 0;
              const remaining = selectedMarket.capacityPerSlot - booked;
              const full = remaining <= 0;
              return (
                <button key={slot} disabled={full} onClick={() => setSelectedSlot(slot)} style={{
                  padding: "12px 8px", borderRadius: 8,
                  border: selectedSlot === slot ? `1px solid ${COLORS.gold}` : "1px solid #3a331f",
                  background: full ? "#00000030" : selectedSlot === slot ? COLORS.gold : COLORS.panelLight,
                  color: full ? "#5c554a" : selectedSlot === slot ? "#000000" : COLORS.cream,
                  opacity: full ? 0.6 : 1,
                }}>
                  <div style={{ fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                    <Clock size={13} /> {fmtTime(slot)}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 3, fontWeight: 700 }}>{full ? "Full" : `${remaining} spot${remaining === 1 ? "" : "s"} left`}</div>
                </button>
              );
            })}
          </div>
          <NextBar disabled={!selectedSlot} onClick={() => setStep(4)} label="Continue" />
        </div>
      )}

      {/* Step 4: customer info */}
      {step === 4 && selectedMarket && (
        <div className="fade-in">
          <BackRow onClick={() => setStep(3)} />
          <div style={eyebrow}>Step 4 of 4 — Your info</div>
          <div style={{ ...display, fontSize: 28, fontWeight: 700, margin: "6px 0 16px" }}>Who's picking up?</div>

          <div style={{ ...cardStyle, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: COLORS.muted, marginBottom: 4 }}>Order</div>
            {cart.map((i) => <div key={i.lineId} style={{ fontSize: 16, marginBottom: 2 }}>{i.qty}× {i.sizeLabel} {i.flavorName} ({i.honeyType === "spun" ? "Spun" : "Regular"})</div>)}
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: COLORS.muted, marginTop: 10, marginBottom: 4 }}>Pickup</div>
            <div style={{ fontSize: 16 }}>{selectedMarket.name}, {fmtDate(selectedMarket.date)} at {fmtTime(selectedSlot)}</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid #3a331f", fontWeight: 800 }}>
              <span>Total (pay at pickup)</span><span style={{ color: COLORS.gold }}>${cartTotal.toFixed(2)}</span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <Field label="First name"><input style={inputStyle} value={customer.firstName} onChange={(e) => setCustomer({ ...customer, firstName: e.target.value })} placeholder="Jane" /></Field>
            <Field label="Last name"><input style={inputStyle} value={customer.lastName} onChange={(e) => setCustomer({ ...customer, lastName: e.target.value })} placeholder="Doe" /></Field>
          </div>
          <Field label="Email"><input type="email" style={inputStyle} value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} placeholder="jane@email.com" /></Field>
          <Field label="Phone"><input type="tel" style={inputStyle} value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="(555) 555-5555" /></Field>
          <Field label="Notes (optional)"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={customer.notes} onChange={(e) => setCustomer({ ...customer, notes: e.target.value })} /></Field>

          {errorMsg && (
            <div style={{ display: "flex", gap: 8, background: "#3a1a14", color: "#ffb4a3", padding: 10, borderRadius: 8, fontSize: 15, marginTop: 6 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {errorMsg}
            </div>
          )}
          <NextBar disabled={submitting} onClick={placeOrder} label={submitting ? "Reserving…" : "Reserve my order"} />
          <div style={{ fontSize: 14, color: COLORS.muted, textAlign: "center", marginTop: 8 }}>Pay with cash or card when you pick up — nothing charged now.</div>
        </div>
      )}

      {/* Step 5: confirmation */}
      {step === 5 && confirmedOrder && (
        <div className="fade-in" style={{ textAlign: "center", paddingTop: 10 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: COLORS.gold, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <Check size={30} color="#000000" />
          </div>
          <div style={{ ...display, fontSize: 26, fontWeight: 700 }}>You're all set, {confirmedOrder.firstName}</div>
          <div style={{ fontSize: 15, color: COLORS.muted, margin: "6px 0 20px" }}>Confirmation #{confirmedOrder.id}</div>
          <div style={{ ...cardStyle, textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: COLORS.muted, marginBottom: 4 }}>Pickup</div>
            <div style={{ fontWeight: 700 }}>{confirmedOrder.marketName}</div>
            <div>{fmtDate(confirmedOrder.marketDate)} at {fmtTime(confirmedOrder.slot)}</div>
            {confirmedOrder.marketAddress && <div style={{ color: COLORS.muted }}>{confirmedOrder.marketAddress}</div>}
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: COLORS.muted, marginTop: 12, marginBottom: 4 }}>Order</div>
            {confirmedOrder.items.map((i) => <div key={i.lineId}>{i.qty}× {i.sizeLabel} {i.flavorName} ({i.honeyType === "spun" ? "Spun" : "Regular"})</div>)}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid #3a331f", fontWeight: 800 }}>
              <span>Due at pickup</span><span style={{ color: COLORS.gold }}>${confirmedOrder.total.toFixed(2)}</span>
            </div>
          </div>
          <button onClick={resetAll} style={{ ...primaryBtnStyle, marginTop: 20 }}>Place another order</button>
        </div>
      )}

      {/* Upsell modal */}
      {showUpsell && builderFlavor && (
        <div style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ ...cardStyle, maxWidth: 380, width: "100%", animation: "popIn 0.2s ease both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <Sparkles size={22} color={COLORS.gold} />
              <button onClick={() => setShowUpsell(false)} style={{ background: "none", border: "none", color: COLORS.muted }}><X size={18} /></button>
            </div>
            <div style={{ ...display, fontSize: 22, fontWeight: 700, marginTop: 8 }}>Wait — mix &amp; match sale!</div>
            <div style={{ fontSize: 15, color: COLORS.muted, marginTop: 6, lineHeight: 1.5 }}>
              Any 3 of our 4oz jars are $20 — that's already cheaper than what you've got. Want 2 more of {builderFlavor.name} to complete the deal?
            </div>
            <button onClick={() => addUpsellJars(2)} style={{ ...primaryBtnStyle, width: "100%", marginTop: 14 }}>
              Add 2 more {builderFlavor.name} jars
            </button>
            <button onClick={() => setShowUpsell(false)} style={{ ...secondaryBtnStyle, width: "100%", marginTop: 8 }}>
              I'll pick different flavors myself
            </button>
            <button onClick={() => setShowUpsell(false)} style={{ background: "none", border: "none", color: COLORS.muted, fontSize: 14, width: "100%", marginTop: 8, padding: 6 }}>
              No thanks, just the one jar
            </button>
          </div>
        </div>
      )}

      {/* Honey type info modal */}
      {showTypeInfo && (
        <div style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50 }}>
          <div style={{ ...cardStyle, maxWidth: 380, width: "100%", animation: "popIn 0.2s ease both" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ ...display, fontSize: 22, fontWeight: 700 }}>Regular vs. Spun</div>
              <button onClick={() => setShowTypeInfo(false)} style={{ background: "none", border: "none", color: COLORS.muted }}><X size={18} /></button>
            </div>
            {HONEY_TYPES.map((t) => (
              <div key={t.id} style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: COLORS.gold }}>{t.label}</div>
                <div style={{ fontSize: 15, color: COLORS.muted, marginTop: 3, lineHeight: 1.5 }}>{t.blurb}</div>
              </div>
            ))}
            <button onClick={() => setShowTypeInfo(false)} style={{ ...primaryBtnStyle, width: "100%", marginTop: 16 }}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
      padding: "10px 4px", borderRadius: 8, border: "none", fontWeight: 700, fontSize: 14,
      background: active ? COLORS.gold : "#221d14", color: active ? "#000000" : COLORS.cream,
    }}>
      {icon} {label}
    </button>
  );
}

function AdminPanel(props) {
  const {
    unlocked, setUnlocked, passcodeInput, setPasscodeInput, adminTab, setAdminTab,
    markets, addMarket, deleteMarket, newMarket, setNewMarket, addingMarket, marketError,
    orders, loadingOrders, togglePickedUp, eventRequests, setEventStatus,
    flavors, newFlavor, setNewFlavor, addFlavor, addingFlavor, flavorError,
    toggleFlavorField, deleteFlavor, eyebrow, display,
  } = props;

  if (!unlocked) {
    return (
      <div style={{ maxWidth: 360, margin: "60px auto", padding: "0 20px", textAlign: "center" }}>
        <Lock size={28} style={{ marginBottom: 10, color: COLORS.muted }} />
        <div style={{ ...display, fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Vendor login</div>
        <input type="password" value={passcodeInput} onChange={(e) => setPasscodeInput(e.target.value)}
          placeholder="Passcode" style={{ ...inputStyle, textAlign: "center", marginBottom: 10 }}
          onKeyDown={(e) => { if (e.key === "Enter" && passcodeInput === ADMIN_PASSCODE) setUnlocked(true); }} />
        <button onClick={() => { if (passcodeInput === ADMIN_PASSCODE) setUnlocked(true); }} style={{ ...primaryBtnStyle, width: "100%" }}>Enter</button>
        <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 12 }}>Passcode is set in src/App.jsx — change ADMIN_PASSCODE, then rebuild and redeploy.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "20px 16px 60px" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        <TabButton active={adminTab === "markets"} onClick={() => setAdminTab("markets")} icon={<Calendar size={13} />} label="Markets" />
        <TabButton active={adminTab === "flavors"} onClick={() => setAdminTab("flavors")} icon={<Hexagon size={13} />} label="Flavors" />
        <TabButton active={adminTab === "orders"} onClick={() => setAdminTab("orders")} icon={<ClipboardList size={13} />} label="Orders" />
        <TabButton active={adminTab === "events"} onClick={() => setAdminTab("events")} icon={<PartyPopper size={13} />} label="Events" />
      </div>

      {adminTab === "markets" && (
        <div>
          <div style={eyebrow}>Add a market</div>
          <div style={{ ...cardStyle, margin: "8px 0 18px" }}>
            <Field label="Market name"><input style={inputStyle} value={newMarket.name} onChange={(e) => setNewMarket({ ...newMarket, name: e.target.value })} placeholder="e.g. Saturday Downtown Market" /></Field>
            <Field label="Address"><input style={inputStyle} value={newMarket.address} onChange={(e) => setNewMarket({ ...newMarket, address: e.target.value })} placeholder="123 Main St" /></Field>
            <Field label="Date"><input type="date" style={inputStyle} value={newMarket.date} onChange={(e) => setNewMarket({ ...newMarket, date: e.target.value })} /></Field>
            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Start time"><input type="time" style={inputStyle} value={newMarket.startTime} onChange={(e) => setNewMarket({ ...newMarket, startTime: e.target.value })} /></Field>
              <Field label="End time"><input type="time" style={inputStyle} value={newMarket.endTime} onChange={(e) => setNewMarket({ ...newMarket, endTime: e.target.value })} /></Field>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Field label="Minutes per slot"><input type="number" min="5" style={inputStyle} value={newMarket.slotMinutes} onChange={(e) => setNewMarket({ ...newMarket, slotMinutes: e.target.value })} /></Field>
              <Field label="Orders per slot"><input type="number" min="1" style={inputStyle} value={newMarket.capacityPerSlot} onChange={(e) => setNewMarket({ ...newMarket, capacityPerSlot: e.target.value })} /></Field>
            </div>
            <button onClick={addMarket} disabled={addingMarket} style={{ ...primaryBtnStyle, width: "100%", marginTop: 4, opacity: addingMarket ? 0.6 : 1 }}>{addingMarket ? "Adding…" : "Add market"}</button>
            {marketError && <div style={{ display: "flex", gap: 8, background: "#3a1a14", color: "#ffb4a3", padding: 10, borderRadius: 8, fontSize: 15, marginTop: 8 }}><AlertCircle size={16} /> {marketError}</div>}
          </div>
          <div style={eyebrow}>Upcoming markets</div>
          <div style={{ marginTop: 8 }}>
            {markets.length === 0 && <EmptyNote text="No markets added yet." />}
            {markets.map((m) => {
              const totalBooked = Object.values(m.bookings || {}).reduce((a, b) => a + b, 0);
              return (
                <div key={m.id} style={{ ...cardStyle, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{m.name}</div>
                    <div style={{ fontSize: 14, color: COLORS.muted }}>{fmtDate(m.date)} · {fmtTime(m.startTime)}–{fmtTime(m.endTime)}</div>
                    <div style={{ fontSize: 14, color: COLORS.muted }}>{totalBooked} reservation{totalBooked === 1 ? "" : "s"} so far</div>
                  </div>
                  <button onClick={() => deleteMarket(m.id)} style={{ background: "none", border: "none", color: COLORS.red, padding: 4 }}><Trash2 size={16} /></button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {adminTab === "flavors" && (
        <div>
          <div style={eyebrow}>Add a flavor</div>
          <div style={{ ...cardStyle, margin: "8px 0 18px" }}>
            <Field label="Flavor name"><input style={inputStyle} value={newFlavor.name} onChange={(e) => setNewFlavor({ ...newFlavor, name: e.target.value })} placeholder="e.g. Lavender" /></Field>
            <Field label="Category">
              <div style={{ display: "flex", gap: 8 }}>
                {["core", "seasonal"].map((c) => (
                  <button key={c} onClick={() => setNewFlavor({ ...newFlavor, category: c })} style={{
                    flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 15, fontWeight: 700, textTransform: "capitalize",
                    border: newFlavor.category === c ? `1px solid ${COLORS.gold}` : "1px solid #3a331f",
                    background: newFlavor.category === c ? "#2b2412" : COLORS.panelLight, color: COLORS.cream,
                  }}>{c}</button>
                ))}
              </div>
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 15, marginBottom: 10, color: COLORS.cream }}>
              <input type="checkbox" checked={newFlavor.featured} onChange={(e) => setNewFlavor({ ...newFlavor, featured: e.target.checked })} />
              Feature this flavor at the top for customers
            </label>
            <button onClick={addFlavor} disabled={addingFlavor} style={{ ...primaryBtnStyle, width: "100%", opacity: addingFlavor ? 0.6 : 1 }}>{addingFlavor ? "Adding…" : "Add flavor"}</button>
            {flavorError && <div style={{ display: "flex", gap: 8, background: "#3a1a14", color: "#ffb4a3", padding: 10, borderRadius: 8, fontSize: 15, marginTop: 8 }}><AlertCircle size={16} /> {flavorError}</div>}
          </div>

          <div style={eyebrow}>All flavors</div>
          <div style={{ fontSize: 14, color: COLORS.muted, margin: "4px 0 8px" }}>Toggle Featured to spotlight a flavor for customers. Toggle Active off to hide it without deleting it (handy for rotating flavors out for the season).</div>
          {flavors.map((f) => (
            <div key={f.id} style={{ ...cardStyle, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{f.name}</div>
                <div style={{ fontSize: 13, color: COLORS.muted, textTransform: "capitalize" }}>{f.category}{!f.active ? " · hidden" : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button onClick={() => toggleFlavorField(f, "featured")} style={{
                  fontSize: 13, fontWeight: 700, padding: "5px 10px", borderRadius: 20, border: "none",
                  background: f.featured ? COLORS.gold : "#3a331f", color: f.featured ? "#000000" : COLORS.muted,
                }}>Featured</button>
                <button onClick={() => toggleFlavorField(f, "active")} style={{
                  fontSize: 13, fontWeight: 700, padding: "5px 10px", borderRadius: 20, border: "none",
                  background: f.active ? COLORS.blue : "#3a331f", color: f.active ? "#0B0A08" : COLORS.muted,
                }}>Active</button>
                <button onClick={() => deleteFlavor(f.id)} style={{ background: "none", border: "none", color: COLORS.red, padding: 4 }}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adminTab === "orders" && (
        <div>
          <div style={eyebrow}>Pickup reservations</div>
          {loadingOrders && <div style={{ color: COLORS.muted, marginTop: 8 }}>Loading…</div>}
          {!loadingOrders && orders.length === 0 && <EmptyNote text="No orders yet." />}
          <div style={{ marginTop: 8 }}>
            {orders.map((o) => (
              <div key={o.id} style={{ ...cardStyle, marginBottom: 8, opacity: o.pickedUp ? 0.5 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 700 }}>{o.firstName} {o.lastName}</div>
                  <div style={{ fontWeight: 700, color: COLORS.gold }}>${o.total.toFixed(2)}</div>
                </div>
                <div style={{ fontSize: 14, color: COLORS.muted }}>{o.email} · {o.phone}</div>
                <div style={{ fontSize: 14, marginTop: 4 }}>{o.marketName} · {fmtDate(o.marketDate)} at {fmtTime(o.slot)}</div>
                <div style={{ fontSize: 14, marginTop: 4, color: COLORS.muted }}>
                  {o.items.map((i) => `${i.qty}× ${i.sizeLabel} ${i.flavorName} (${i.honeyType === "spun" ? "Spun" : "Regular"})`).join(", ")}
                </div>
                {o.notes && <div style={{ fontSize: 14, marginTop: 4, fontStyle: "italic", color: COLORS.muted }}>"{o.notes}"</div>}
                <button onClick={() => togglePickedUp(o)} style={{
                  marginTop: 8, fontSize: 14, fontWeight: 700, padding: "6px 12px", borderRadius: 20, border: "none",
                  background: o.pickedUp ? "#3a331f" : COLORS.blue, color: o.pickedUp ? COLORS.muted : "#0B0A08",
                }}>{o.pickedUp ? "Picked up ✓" : "Mark picked up"}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {adminTab === "events" && (
        <div>
          <div style={eyebrow}>Special event requests</div>
          {eventRequests.length === 0 && <EmptyNote text="No event requests yet." />}
          <div style={{ marginTop: 8 }}>
            {eventRequests.map((r) => (
              <div key={r.id} style={{ ...cardStyle, marginBottom: 8, opacity: r.status === "booked" ? 0.6 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 700 }}>{r.firstName} {r.lastName}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: COLORS.orange }}>{r.status}</div>
                </div>
                <div style={{ fontSize: 14, color: COLORS.muted }}>{r.email} · {r.phone}</div>
                <div style={{ fontSize: 15, marginTop: 6 }}><strong>Event:</strong> {r.eventType || "—"} {r.eventDate ? `· ${fmtDate(r.eventDate)}` : ""}</div>
                <div style={{ fontSize: 15, marginTop: 2 }}><strong>Quantity:</strong> {r.quantityEstimate || "—"}</div>
                <div style={{ fontSize: 15, marginTop: 2 }}><strong>Sizes:</strong> {r.preferredSizes || "no preference"}</div>
                <div style={{ fontSize: 15, marginTop: 2 }}><strong>Flavors:</strong> {r.preferredFlavors || "no preference"}</div>
                {r.budgetNote && <div style={{ fontSize: 15, marginTop: 2 }}><strong>Budget:</strong> {r.budgetNote}</div>}
                {r.notes && <div style={{ fontSize: 14, marginTop: 4, fontStyle: "italic", color: COLORS.muted }}>"{r.notes}"</div>}
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {["new", "contacted", "quoted", "booked"].map((s) => (
                    <button key={s} onClick={() => setEventStatus(r, s)} style={{
                      fontSize: 13, fontWeight: 700, padding: "5px 10px", borderRadius: 20, border: "none", textTransform: "capitalize",
                      background: r.status === s ? COLORS.orange : "#3a331f", color: r.status === s ? "#000000" : COLORS.muted,
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
