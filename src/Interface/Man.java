package Interface;

import java.util.HashSet;
import java.util.Scanner;
public interface Man {
    String pickLetter(Display console, Scanner scanner, String language);
    void addMistake();
    boolean isHangedUp();
    boolean isWon();
    int getMistakes();
    void hangUp();
    void win();
    HashSet<String> getPickedLetters();
}
