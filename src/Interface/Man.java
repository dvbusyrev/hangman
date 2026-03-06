package Interface;

import java.util.HashSet;

public interface Man {
    String pickLetter();
    void addMistake();
    boolean isHangedUp();
    boolean isWon();
    int getMistakes();
    void hangUp();
    void win();
    HashSet<String> getPickedLetters();
    void addCorrectLetter(String letter);
}
