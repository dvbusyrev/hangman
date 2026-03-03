package Interface;

public interface Display {
    static void clearConsole() {
        for (int i = 0; i < 33; i++) {
            System.out.println();
        }
    }

    static void display() {

    };
    void display(String item);
    void display(String[] item);
}
