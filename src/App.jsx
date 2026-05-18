
import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import "./style.css";

const supabase = createClient(
  "https://dqwnnsjagnlwbfeldivz.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxd25uc2phZ25sd2JmZWxkaXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5MjkyNzYsImV4cCI6MjA5NDUwNTI3Nn0.C8_pPWBLNmRMoINRqKrt2quxnyuuoU4I3H4BNykm0_g"
);

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmt(d) {
  return new Intl.DateTimeFormat("nl-NL", { weekday:"long", day:"numeric", month:"long", year:"numeric" }).format(new Date(d + "T12:00:00"));
}
function fallbackEvents() {
  const t = todayISO();
  return [{ id:"fallback-today", event_date:t, event_type:"repetitie", title:"Vandaag", location:"", active:true }];
}

export default function App() {
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedName, setSelectedName] = useState("");
  const [loginCode, setLoginCode] = useState("");
  const [me, setMe] = useState(null);
  const [role, setRole] = useState("lid");
  const [secretaryCode, setSecretaryCode] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");
  const [registrations, setRegistrations] = useState({});
  const [msg, setMsg] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [newOwnCode, setNewOwnCode] = useState("");
  const [repeatOwnCode, setRepeatOwnCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newVoice, setNewVoice] = useState("Sopraan");
  const [newCode, setNewCode] = useState("");
  const [newEventDate, setNewEventDate] = useState(todayISO());
  const [newEventType, setNewEventType] = useState("repetitie");
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");

  const selectedEvent = events.find(e => String(e.id) === String(selectedEventId)) || events[0];
  const eventKey = selectedEvent ? String(selectedEvent.id) : "";
  const current = registrations[eventKey] || {};
  const isSecretary = role === "secretaris" && secretaryCode === "koor2026";
  const my = me ? current[me.name] || { status:"onbekend", reason:"", note:"" } : { status:"onbekend", reason:"", note:"" };

  useEffect(() => { loadMembers(); loadEvents(); }, []);
  useEffect(() => { if (selectedEvent) loadAttendance(selectedEvent); }, [selectedEventId]);

  async function loadMembers() {
    const { data, error } = await supabase.from("members")
      .select("name,voice,login_code,is_secretary").eq("active", true)
      .order("voice").order("name");
    if (error) return setMsg("Ledenlijst kon niet geladen worden: " + error.message);
    setMembers(data || []);
    if (!selectedName && data?.length) setSelectedName(data[0].name);
  }

  async function loadEvents() {
    const { data, error } = await supabase.from("events")
      .select("id,event_date,event_type,title,location,active")
      .eq("active", true).gte("event_date", todayISO()).order("event_date");
    if (error) {
      const f = fallbackEvents();
      setEvents(f); setSelectedEventId(f[0].id);
      return setMsg("Evenementen konden niet geladen worden. Voer supabase-events-update.sql uit.");
    }
    const list = data?.length ? data : fallbackEvents();
    setEvents(list);
    if (!selectedEventId && list.length) setSelectedEventId(String(list[0].id));
  }

  async function loadAttendance(event) {
    const { data, error } = await supabase.from("attendance")
      .select("member_name,status,reason,note")
      .eq("event_id", event.id);
    if (error) return setMsg("Aanmeldingen konden niet geladen worden: " + error.message);
    const map = {};
    (data || []).forEach(r => map[r.member_name] = { status:r.status, reason:r.reason || "", note:r.note || "" });
    setRegistrations(prev => ({ ...prev, [String(event.id)]: map }));
  }

  function login() {
    const found = members.find(m => m.name === selectedName);
    if (!found) return setMsg("Kies eerst je naam.");
    if (!found.login_code) return setMsg("Voor dit lid is nog geen persoonlijke code ingesteld.");
    if (String(found.login_code).trim() !== String(loginCode).trim()) return setMsg("De persoonlijke code klopt niet.");
    setMe(found); if (found.is_secretary) setRole("secretaris");
    setMsg(""); setSaveMsg("");
  }

  function logout() { setMe(null); setLoginCode(""); setRole("lid"); setSecretaryCode(""); setSaveMsg(""); }

  async function updateEntry(part) {
    if (!me?.name) return setMsg("Je bent nog niet ingelogd.");
    if (!selectedEvent) return setMsg("Kies eerst een repetitie of optreden.");
    const next = { ...my, ...part };
    setRegistrations(prev => ({ ...prev, [eventKey]: { ...(prev[eventKey] || {}), [me.name]: next } }));
    const { error } = await supabase.from("attendance").upsert({
      event_id:selectedEvent.id, rehearsal_date:selectedEvent.event_date, member_name:me.name,
      status:next.status, reason:next.reason, note:next.note, updated_at:new Date().toISOString()
    }, { onConflict:"event_id,member_name" });
    if (error) { setSaveMsg(""); return setMsg("Opslaan mislukt: " + error.message); }
    setMsg(""); setSaveMsg("Online opgeslagen."); await loadAttendance(selectedEvent);
  }

  async function changeOwnCode() {
    if (!me?.name) return setMsg("Je bent nog niet ingelogd.");
    if (!currentCode.trim() || !newOwnCode.trim() || !repeatOwnCode.trim()) {
      return setMsg("Vul alle codevelden in.");
    }
    if (String(currentCode).trim() !== String(me.login_code).trim()) {
      return setMsg("De huidige code klopt niet.");
    }
    if (newOwnCode.trim().length < 4) {
      return setMsg("Kies een nieuwe code van minimaal 4 tekens.");
    }
    if (newOwnCode.trim() !== repeatOwnCode.trim()) {
      return setMsg("De nieuwe codes zijn niet gelijk.");
    }

    const { error } = await supabase
      .from("members")
      .update({ login_code: newOwnCode.trim() })
      .eq("name", me.name);

    if (error) return setMsg("Code wijzigen mislukt: " + error.message);

    setMe(prev => ({ ...prev, login_code: newOwnCode.trim() }));
    setMembers(prev => prev.map(m => m.name === me.name ? { ...m, login_code: newOwnCode.trim() } : m));
    setCurrentCode("");
    setNewOwnCode("");
    setRepeatOwnCode("");
    setMsg("");
    setSaveMsg("Je persoonlijke code is gewijzigd.");
  }

  async function addMember() {
    if (!newName.trim() || !newCode.trim()) return setMsg("Vul naam en persoonlijke code in.");
    const { error } = await supabase.from("members").insert({ name:newName.trim(), voice:newVoice, login_code:newCode.trim(), active:true, is_secretary:false });
    if (error) return setMsg("Lid toevoegen mislukt: " + error.message);
    setNewName(""); setNewCode(""); setMsg("Lid toegevoegd."); await loadMembers();
  }
  async function removeMember(name) {
    const { error } = await supabase.from("members").update({ active:false }).eq("name", name);
    if (error) return setMsg("Verwijderen mislukt: " + error.message);
    setMsg("Lid uit actieve lijst gehaald."); await loadMembers();
  }
  async function changeVoice(name, voice) {
    const { error } = await supabase.from("members").update({ voice }).eq("name", name);
    if (error) return setMsg("Stemgroep wijzigen mislukt: " + error.message);
    setMembers(prev => prev.map(m => m.name === name ? { ...m, voice } : m));
  }
  async function changeCode(name, code) {
    const { error } = await supabase.from("members").update({ login_code:code }).eq("name", name);
    if (error) return setMsg("Code wijzigen mislukt: " + error.message);
    setMembers(prev => prev.map(m => m.name === name ? { ...m, login_code:code } : m));
  }

  async function addEvent() {
    if (!newEventDate) return setMsg("Kies een datum.");
    const title = newEventTitle.trim() || (newEventType === "optreden" ? "Optreden" : "Repetitie");
    const { error } = await supabase.from("events").insert({ event_date:newEventDate, event_type:newEventType, title, location:newEventLocation.trim(), active:true });
    if (error) return setMsg("Moment toevoegen mislukt: " + error.message);
    setNewEventTitle(""); setNewEventLocation(""); setMsg("Moment toegevoegd."); await loadEvents();
  }
  async function removeEvent(id) {
    const { error } = await supabase.from("events").update({ active:false }).eq("id", id);
    if (error) return setMsg("Moment verwijderen mislukt: " + error.message);
    setMsg("Moment verwijderd uit de lijst."); await loadEvents();
  }

  const stats = useMemo(() => {
    const r = { aanwezig:0, afwezig:0, misschien:0, onbekend:0 };
    members.forEach(m => r[current[m.name]?.status || "onbekend"]++);
    return r;
  }, [members, current]);

  const voiceStats = useMemo(() => {
    const groups = {};
    members.forEach(m => {
      if (!groups[m.voice]) groups[m.voice] = { aanwezig:0, afwezig:0, misschien:0, onbekend:0, totaal:0 };
      const status = current[m.name]?.status || "onbekend";
      groups[m.voice][status]++;
      groups[m.voice].totaal++;
    });
    return groups;
  }, [members, current]);

  function exportCsv() {
    if (!selectedEvent) return;
    const rows = [["Datum","Type","Titel","Locatie","Lid","Stemgroep","Status","Reden","Opmerking"]];
    members.forEach(m => {
      const e = current[m.name] || { status:"onbekend", reason:"", note:"" };
      rows.push([fmt(selectedEvent.event_date), selectedEvent.event_type, selectedEvent.title || "", selectedEvent.location || "", m.name, m.voice, e.status, e.reason, e.note]);
    });
    const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `exaltation-aanmeldingen-${selectedEvent.event_date}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  if (!me) return (
    <main className="page login-page">
      <section className="login-card">
        <img src="/exaltation.png" className="login-logo" alt="Exaltation Gospel Koor" />
        <p className="eyebrow">Exaltation Gospel Koor</p><h1>Inloggen</h1>
        <p>Kies je naam en vul je persoonlijke code in.</p>
        <label>Naam</label><select value={selectedName} onChange={e=>setSelectedName(e.target.value)}>{members.map(m=><option key={m.name} value={m.name}>{m.name} · {m.voice}</option>)}</select>
        <label>Persoonlijke code</label><input type="password" value={loginCode} onChange={e=>setLoginCode(e.target.value)} placeholder="Bijvoorbeeld 1234" />
        <button className="full-button" onClick={login}>Inloggen</button>
        {msg && <div className="message">{msg}</div>}
      </section>
    </main>
  );

  return (
    <main className="page"><div className="container">
      <header className="hero"><div className="hero-left">
        <img src="/exaltation.png" className="logo" alt="Exaltation Gospel Koor" />
        <div><p className="eyebrow">Exaltation Gospel Koor</p><h1>Aan- en afmelden</h1><p className="subtitle">Ingelogd als {me.name} · {me.voice}</p></div>
      </div><div className="top-actions">{me.is_secretary && <div className="tabs"><button className={role==="lid"?"active":""} onClick={()=>setRole("lid")}>Lid</button><button className={role==="secretaris"?"active":""} onClick={()=>setRole("secretaris")}>Secretaris</button></div>}</div></header>
      {msg && <div className="message">{msg}</div>}
      <section className={isSecretary ? "grid" : "single-grid"}>
        <div className="card"><h2>Repetitie of optreden</h2>
          <label>Datum</label><select value={selectedEventId} onChange={e=>setSelectedEventId(e.target.value)}>{events.map(e=><option key={e.id} value={e.id}>{fmt(e.event_date)} · {e.event_type} · {e.title || ""}</option>)}</select>
          {selectedEvent && <div className="event-info"><strong>{selectedEvent.title}</strong><span>{selectedEvent.event_type} · {fmt(selectedEvent.event_date)}</span>{selectedEvent.location && <span>{selectedEvent.location}</span>}</div>}
          {role === "lid" ? <>
            <div className="member-box"><strong>{me.name}</strong><span>{me.voice}</span></div>
            <div className="status-grid">
              <button className={my.status==="aanwezig"?"status-button active-present":"status-button"} onClick={()=>updateEntry({status:"aanwezig"})}>Aanwezig</button>
              <button className={my.status==="afwezig"?"status-button active-absent":"status-button"} onClick={()=>updateEntry({status:"afwezig"})}>Afwezig</button>
              <button className={my.status==="misschien"?"status-button active-maybe":"status-button"} onClick={()=>updateEntry({status:"misschien"})}>Misschien</button>
            </div>
            <label>Reden</label><select value={my.reason} onChange={e=>updateEntry({reason:e.target.value})}><option value="">Geen reden</option><option>Ziek</option><option>Werk</option><option>Vakantie</option><option>Familie</option><option>Vervoer</option><option>Anders</option></select>
            <label>Opmerking</label><input value={my.note} onChange={e=>updateEntry({note:e.target.value})} placeholder="Bijvoorbeeld: ik kom wat later" />
            <div className="current">Huidige keuze: <strong>{my.status}</strong></div>{saveMsg && <div className="save-message">{saveMsg}</div>}

            <details className="account-box">
              <summary>Mijn persoonlijke code wijzigen</summary>
              <label>Huidige code</label>
              <input type="password" value={currentCode} onChange={e=>setCurrentCode(e.target.value)} placeholder="Huidige code" />
              <label>Nieuwe code</label>
              <input type="password" value={newOwnCode} onChange={e=>setNewOwnCode(e.target.value)} placeholder="Minimaal 4 tekens" />
              <label>Nieuwe code herhalen</label>
              <input type="password" value={repeatOwnCode} onChange={e=>setRepeatOwnCode(e.target.value)} placeholder="Herhaal nieuwe code" />
              <button className="full-button" onClick={changeOwnCode}>Code wijzigen</button>
            </details>
          </> : <><label>Secretariscode</label><input type="password" value={secretaryCode} onChange={e=>setSecretaryCode(e.target.value)} placeholder="Secretariscode" /></>}
          <button className="logout-bottom outline" onClick={logout}>Uitloggen</button>
        </div>
        {isSecretary && <div className="card dashboard">
          <div className="dash-head"><div><h2>Dashboard secretaris</h2><p>{selectedEvent ? fmt(selectedEvent.event_date) : ""}</p></div><button className="outline" onClick={exportCsv}>CSV export</button></div>
          <div className="stat-grid"><div className="stat green"><strong>{stats.aanwezig}</strong><span>Aanwezig</span></div><div className="stat red"><strong>{stats.afwezig}</strong><span>Afwezig</span></div><div className="stat yellow"><strong>{stats.misschien}</strong><span>Misschien</span></div><div className="stat grey"><strong>{stats.onbekend}</strong><span>Onbekend</span></div></div>

          <h3>Overzicht per stemgroep</h3>
          <div className="voice-grid">
            {Object.entries(voiceStats).map(([voice, s]) => (
              <div className="voice-card" key={voice}>
                <strong>{voice}</strong>
                <p>Aanwezig: {s.aanwezig}/{s.totaal}</p>
                <div className="mini-stats">
                  <span>Afw. {s.afwezig}</span>
                  <span>Miss. {s.misschien}</span>
                  <span>Onb. {s.onbekend}</span>
                </div>
                <div className="bar"><span style={{ width: `${s.totaal ? (s.aanwezig / s.totaal) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>

          <h3>Momenten beheren</h3><div className="event-form"><input type="date" value={newEventDate} onChange={e=>setNewEventDate(e.target.value)} /><select value={newEventType} onChange={e=>setNewEventType(e.target.value)}><option value="repetitie">Repetitie</option><option value="optreden">Optreden</option></select><input value={newEventTitle} onChange={e=>setNewEventTitle(e.target.value)} placeholder="Titel, optioneel" /><input value={newEventLocation} onChange={e=>setNewEventLocation(e.target.value)} placeholder="Locatie, optioneel" /><button onClick={addEvent}>Toevoegen</button></div>
          <div className="table-wrap compact"><table><thead><tr><th>Datum</th><th>Type</th><th>Titel</th><th>Locatie</th><th>Actie</th></tr></thead><tbody>{events.map(e=><tr key={e.id}><td>{fmt(e.event_date)}</td><td>{e.event_type}</td><td>{e.title}</td><td>{e.location || "—"}</td><td><button className="outline danger" onClick={()=>removeEvent(e.id)}>Verwijderen</button></td></tr>)}</tbody></table></div>
          <h3>Aanmeldingen</h3><div className="table-wrap"><table><thead><tr><th>Lid</th><th>Stemgroep</th><th>Status</th><th>Reden/opmerking</th></tr></thead><tbody>{members.map(m=>{const e=current[m.name]||{status:"onbekend",reason:"",note:""};return <tr key={m.name}><td>{m.name}</td><td>{m.voice}</td><td><span className="pill">{e.status}</span></td><td>{[e.reason,e.note].filter(Boolean).join(" · ") || "—"}</td></tr>})}</tbody></table></div>
          <h3>Ledenbeheer</h3><div className="member-form"><input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Naam" /><select value={newVoice} onChange={e=>setNewVoice(e.target.value)}><option>Sopraan</option><option>Alt</option><option>Tenor</option><option>Bas</option></select><input value={newCode} onChange={e=>setNewCode(e.target.value)} placeholder="Code" /><button onClick={addMember}>Lid toevoegen</button></div>
          <div className="table-wrap"><table><thead><tr><th>Naam</th><th>Stemgroep</th><th>Code</th><th>Actie</th></tr></thead><tbody>{members.map(m=><tr key={m.name}><td>{m.name}</td><td><select value={m.voice} onChange={e=>changeVoice(m.name,e.target.value)}><option>Sopraan</option><option>Alt</option><option>Tenor</option><option>Bas</option></select></td><td><input value={m.login_code || ""} onChange={e=>changeCode(m.name,e.target.value)} /></td><td><button className="outline danger" onClick={()=>removeMember(m.name)}>Verwijderen</button></td></tr>)}</tbody></table></div>
        </div>}
      </section>
    </div></main>
  );
}
