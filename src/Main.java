import Class.*;
import Interface.*;
class Main {
    public static void main(String[] args) {
        try {
            new MenuImpl();
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
//    JudiciaryImpl judiciary = new JudiciaryImpl();
//    judiciary.printGlossary();
//    judiciary.printRules();
    }
}