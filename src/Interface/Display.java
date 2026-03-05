package Interface;

import java.util.HashSet;

public interface Display {
    static void clear() {
        try {
            String os = System.getProperty("os.name").toLowerCase();
            ProcessBuilder pb;
            if (os.contains("win")) {
                // Windows
                pb = new ProcessBuilder("cmd", "/c", "cls");
            } else {
                // Unix/Linux/Mac
                pb = new ProcessBuilder("clear");
            }
            Process process = pb.inheritIO().start();
            process.waitFor();
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
    static void promt() {
        System.out.print(">");
    }

    void draw(String inStr);
    void drawKeyboard(String inStr, HashSet<String> pickedLetters);
    void drawWord(String guessedWord);
}
