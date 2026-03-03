import Interface.*;
import Class.*;

public class Main {
    public static void main(String[] args) {
        Menu menu = new MenuImpl();

        while (true) {
            try {
                menu.chooseAction();
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
        }
    }
}