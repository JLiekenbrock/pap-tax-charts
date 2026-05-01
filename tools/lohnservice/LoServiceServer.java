import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.math.BigDecimal;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.HashMap;

public class LoServiceServer {
    public static void main(String[] args) throws Exception {
        int port = 8080;
        if (args.length > 0) {
            try { port = Integer.parseInt(args[0]); } catch (Exception e) {}
        }

        HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/calc", new CalcHandler());
        server.setExecutor(java.util.concurrent.Executors.newCachedThreadPool());
        System.out.println("LoServiceServer listening on port " + port);
        server.start();
    }

    static class CalcHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) {
            try {
                Map<String,String> q = queryToMap(exchange.getRequestURI().getQuery());
                String re4s = q.getOrDefault("re4", "0");
                String stkls = q.getOrDefault("stkl", "1");
                String zkfs = q.getOrDefault("zkf", "0");

                int re4 = Integer.parseInt(re4s);
                int stkl = Integer.parseInt(stkls);
                BigDecimal zkf = new BigDecimal(zkfs);

                String xml = invokeLohnservice(re4, stkl, zkf);

                byte[] resp = xml.getBytes("UTF-8");
                exchange.getResponseHeaders().set("Content-Type", "application/xml; charset=utf-8");
                exchange.sendResponseHeaders(200, resp.length);
                OutputStream os = exchange.getResponseBody();
                os.write(resp);
                os.close();
            } catch (Exception e) {
                try {
                    byte[] resp = ("<error>"+e.toString()+"</error>").getBytes("UTF-8");
                    exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
                    exchange.sendResponseHeaders(500, resp.length);
                    OutputStream os = exchange.getResponseBody();
                    os.write(resp);
                    os.close();
                } catch (Exception ex) {}
            }
        }
    }

    private static String invokeLohnservice(int re4, int stkl, BigDecimal zkf) throws Exception {
        Class<?> lohnClass = Class.forName("de.powerproject.lohnpap.pap.Lohnsteuer");
        Method getInstance = lohnClass.getMethod("getInstance");
        Object ls = getInstance.invoke(null);

        Method setLzz = ls.getClass().getMethod("setLzz", int.class);
        Method setRe4 = ls.getClass().getMethod("setRe4", BigDecimal.class);
        Method setStkl = ls.getClass().getMethod("setStkl", int.class);
        Method setZkf = ls.getClass().getMethod("setZkf", BigDecimal.class);
        Method mainMethod = ls.getClass().getMethod("main");

        setLzz.invoke(ls, 1);
        setRe4.invoke(ls, new BigDecimal(re4));
        setStkl.invoke(ls, stkl);
        setZkf.invoke(ls, zkf);

        mainMethod.invoke(ls);

        Object lstjahr = tryInvoke(ls, "getLstjahr");
        Object lstlzz = tryInvoke(ls, "getLstlzz");
        Object vfrb = tryInvoke(ls, "getVfrb");
        Object wvfrb = tryInvoke(ls, "getWvfrb");

        StringBuilder sb = new StringBuilder();
        sb.append("<lohnsteuer>\n");
        sb.append("  <ausgabe name=\"LSTJAHR\" value=\"").append(lstjahr!=null?lstjahr.toString():"null").append("\"/>\n");
        sb.append("  <ausgabe name=\"LSTLZZ\" value=\"").append(lstlzz!=null?lstlzz.toString():"null").append("\"/>\n");
        sb.append("  <ausgabe name=\"VFRB\" value=\"").append(vfrb!=null?vfrb.toString():"null").append("\"/>\n");
        sb.append("  <ausgabe name=\"WVFRB\" value=\"").append(wvfrb!=null?wvfrb.toString():"null").append("\"/>\n");
        sb.append("</lohnsteuer>\n");
        return sb.toString();
    }

    private static Object tryInvoke(Object target, String methodName) {
        try {
            Method m = target.getClass().getMethod(methodName);
            return m.invoke(target);
        } catch (NoSuchMethodException ns) {
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private static Map<String, String> queryToMap(String query) {
        Map<String, String> result = new HashMap<>();
        if (query == null) return result;
        for (String param : query.split("&")) {
            String[] parts = param.split("=", 2);
            if (parts.length == 2) result.put(parts[0], parts[1]);
            else if (parts.length == 1) result.put(parts[0], "");
        }
        return result;
    }
}
