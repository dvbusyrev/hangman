package Class;
import Interface.*;
import java.util.HashSet;
import java.util.Scanner;

public class ManImpl implements Man {
    private int mistakes;
    private boolean isHangedUp;
    private HashSet<String> pickedLetters;

    public ManImpl() {
        mistakes = 0;
        isHangedUp = false;
        pickedLetters = new HashSet<>();
    }

    @Override
    public String pickLetter() {
        Display.promt();
        Scanner scanner = new Scanner(System.in);
        String letter = scanner.nextLine();
        if (letter != null
                && letter.length() == 1
                && letter.matches("[a-zA-Z]+")
                && !pickedLetters.contains(letter)) {
            return letter.toUpperCase();
        }
         return null;
    }

    @Override
    public void addMiss() {
        mistakes++;
    }

    @Override
    public boolean isHangedUp() {
        return isHangedUp;
    }

    @Override
    public void hangeUp() {
        isHangedUp = true;
    }

    @Override
    public HashSet<String> getPickedLetters() {
        return pickedLetters;
    }

    @Override
    public int getMistakes() {
        return mistakes;
    }

    @Override
    public void addLetter(String letter) {
        pickedLetters.add(letter);
    }
}
