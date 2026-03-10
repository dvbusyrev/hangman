import Class.*;
import Interface.*;
public class Main {
    public static void main(String[] args) {
        try {
            new MenuImpl();
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
    }
}