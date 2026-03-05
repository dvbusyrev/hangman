package Interface;

import java.util.HashSet;

public interface Man {
    String pickLetter();
    void addMiss();
    boolean isHangedUp();
    int getMistakes();
    void hangeUp();
    HashSet<String> getPickedLetters();
    void addLetter(String letter);
}
