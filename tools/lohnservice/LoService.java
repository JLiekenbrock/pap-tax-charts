import java.math.BigDecimal;
import java.lang.reflect.Method;
import java.util.Calendar;
import java.util.Date;

/**
 * Reflection-based CLI wrapper to run the Lohnsteuer jar locally.
 * Usage: java -cp lohnsteuer.jar;. LoService RE4_cents STKL ZKF [papYear]
 * Optional {@code papYear} (e.g. 2021) selects {@code Lohnsteuer.getInstance(Date)} on that calendar year
 * (mid-year), so the multi-year factory returns {@code Lohnsteuer2021} etc. Without it, the JVM’s “today” is used
 * (often {@code Lohnsteuer2026} only).
 */
public class LoService {
    public static void main(String[] args) throws Exception {
        if (args.length < 3) {
            System.err.println("Usage: LoService RE4_cents STKL ZKF [papYear]");
            System.exit(2);
        }
        int re4 = Integer.parseInt(args[0]);
        int stkl = Integer.parseInt(args[1]);
        BigDecimal zkf = new BigDecimal(args[2]);

        // load Lohnsteuer class reflectively from the lohnsteuer.jar on the runtime classpath
        Class<?> lohnClass = Class.forName("de.powerproject.lohnpap.pap.Lohnsteuer");
        Object ls;
        if (args.length >= 4) {
            int papYear = Integer.parseInt(args[3]);
            Calendar cal = Calendar.getInstance();
            cal.clear();
            cal.set(papYear, Calendar.JULY, 1, 12, 0, 0);
            Date d = cal.getTime();
            Method getInstanceDate = lohnClass.getMethod("getInstance", Date.class);
            ls = getInstanceDate.invoke(null, d);
        } else {
            Method getInstance = lohnClass.getMethod("getInstance");
            ls = getInstance.invoke(null);
        }

        // locate setter methods
        Method setLzz = ls.getClass().getMethod("setLzz", int.class);
        Method setRe4 = ls.getClass().getMethod("setRe4", BigDecimal.class);
        Method setStkl = ls.getClass().getMethod("setStkl", int.class);
        Method setZkf = ls.getClass().getMethod("setZkf", BigDecimal.class);
        Method mainMethod = ls.getClass().getMethod("main");

        // set inputs (LZZ=1 for annual as used by tests)
        setLzz.invoke(ls, 1);
        setRe4.invoke(ls, new BigDecimal(re4));
        setStkl.invoke(ls, stkl);
        setZkf.invoke(ls, zkf);

        // run main calculation
        mainMethod.invoke(ls);

        // try to read outputs
        Object lstjahr = tryInvoke(ls, "getLstjahr");
        Object lstlzz = tryInvoke(ls, "getLstlzz");
        Object vfrb = tryInvoke(ls, "getVfrb");
        Object wvfrb = tryInvoke(ls, "getWvfrb");

        System.out.println("<lohnsteuer>");
        System.out.println("  <ausgabe name=\"LSTJAHR\" value=\"" + (lstjahr != null ? lstjahr.toString() : "null") + "\"/>" );
        System.out.println("  <ausgabe name=\"LSTLZZ\" value=\"" + (lstlzz != null ? lstlzz.toString() : "null") + "\"/>" );
        System.out.println("  <ausgabe name=\"VFRB\" value=\"" + (vfrb != null ? vfrb.toString() : "null") + "\"/>" );
        System.out.println("  <ausgabe name=\"WVFRB\" value=\"" + (wvfrb != null ? wvfrb.toString() : "null") + "\"/>" );
        System.out.println("</lohnsteuer>");
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
}
