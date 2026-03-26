/* =========================================================================
   ap.js v3 — JSONP bridge para GitHub Pages → Google Apps Script
   Sin CORS, sin fetch, 100% compatible con GH Pages estático.
   ========================================================================= */
(() => {
  const GAS_URL = (window.GAS_WEBAPP_URL && window.GAS_WEBAPP_URL.trim())
    ? window.GAS_WEBAPP_URL.trim()
    : "";

  if (!GAS_URL) { console.error("ap.js: window.GAS_WEBAPP_URL no definida"); }

  let _cbId = 0;
  const _pending = {};

  // Receptor global de respuestas JSONP
  window.__gasCallback = function(cbId, data) {
    if (_pending[cbId]) { _pending[cbId](data); delete _pending[cbId]; }
  };

  function jsonpCall(url) {
    return new Promise((resolve, reject) => {
      const id = "cb" + (++_cbId) + "_" + Date.now();
      _pending[id] = resolve;
      const s = document.createElement("script");
      s.src = url + (url.includes("?") ? "&" : "?") + "callback=__gasCallback&callbackId=" + id;
      s.onload  = () => { try { s.parentNode.removeChild(s); } catch(e){} };
      s.onerror = () => {
        try { s.parentNode.removeChild(s); } catch(e){}
        delete _pending[id];
        reject(new Error("JSONP request failed"));
      };
      document.head.appendChild(s);
      setTimeout(() => {
        if (_pending[id]) {
          delete _pending[id];
          reject(new Error("JSONP timeout (20s)"));
        }
      }, 20000);
    });
  }

  function qs(obj) {
    return Object.entries(obj)
      .filter(([,v]) => v !== undefined && v !== null && v !== "")
      .map(([k,v]) => encodeURIComponent(k) + "=" + encodeURIComponent(String(v)))
      .join("&");
  }

  function get(api, params) {
    return jsonpCall(GAS_URL + "?" + qs({ api, ...params }));
  }

  function post(api, body) {
    return jsonpCall(GAS_URL + "?" + qs({ api, _data: JSON.stringify(body) }));
  }

  // API pública
  window.GAS = {
    getCatalogo:        ()          => get("catalogo"),
    getPedidos:         (limite=50) => get("pedidos", { limite }),
    getPedido:          (id)        => get("pedido", { id }),
    getClientes:        ()          => get("clientes"),
    getMetricas:        ()          => get("metricas"),
    validarDescuento:   (codigo)    => get("validarDescuento", { codigo }),
    crearPedido:        (payload)   => post("crearPedido", payload),
    actualizarEstado:   (id,estado) => post("actualizarEstado", { id, estado }),
    reabastecerStock:   (id,cant)   => post("reabastecerStock", { id, cantidad: cant }),
  };

  // Compatibilidad con código anterior que usa google.script.run
  class GasCall {
    constructor() { this._sh = null; this._fh = null; }
    withSuccessHandler(fn) { this._sh = fn; return this._proxy(); }
    withFailureHandler(fn) { this._fh = fn; return this._proxy(); }
    _proxy() {
      const sh = this._sh, fh = this._fh;
      return new Proxy({}, {
        get(_, prop) {
          return (...args) => {
            const map = {
              getCatalogo:            () => GAS.getCatalogo(),
              getInventario:          () => GAS.getCatalogo(), // alias
              getPedidosRecientes:    () => GAS.getPedidos(args[0]),
              getDashboardMetricas:   () => GAS.getMetricas(),
              getClientesParaDashboard:()=> GAS.getClientes(),
              crearPedido:            () => GAS.crearPedido(args[0]),
              actualizarEstadoConPDF: () => GAS.actualizarEstado(args[0], args[1]),
              validarDescuento:       () => GAS.validarDescuento(args[0]),
              reabastecerStock:       () => GAS.reabastecerStock(args[0], args[2]),
            };
            const fn = map[prop] || (() => GAS.getCatalogo());
            fn().then(res => { if(sh) sh(res); }).catch(err => { if(fh) fh(err); });
          };
        }
      });
    }
  }

  const runStub = new Proxy({}, {
    get(_, prop) {
      const c = new GasCall();
      if (prop === "withSuccessHandler") return fn => { c._sh=fn; return c._proxy(); };
      if (prop === "withFailureHandler") return fn => { c._fh=fn; return c._proxy(); };
      return (...args) => {
        const map = {
          getCatalogo:            () => GAS.getCatalogo(),
          getInventario:          () => GAS.getCatalogo(),
          getPedidosRecientes:    () => GAS.getPedidos(args[0]),
          getDashboardMetricas:   () => GAS.getMetricas(),
          getClientesParaDashboard:()=> GAS.getClientes(),
          crearPedido:            () => GAS.crearPedido(args[0]),
          actualizarEstadoConPDF: () => GAS.actualizarEstado(args[0], args[1]),
          validarDescuento:       () => GAS.validarDescuento(args[0]),
          reabastecerStock:       () => GAS.reabastecerStock(args[0], args[2]),
        };
        (map[prop]||(() => GAS.getCatalogo()))();
      };
    }
  });

  if (!window.google) window.google = {};
  if (!window.google.script) window.google.script = {};
  window.google.script.run = runStub;

  console.log("ap.js v3 listo. URL:", GAS_URL);
})();
