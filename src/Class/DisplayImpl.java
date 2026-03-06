package Class;
import Interface.*;
import java.io.IOException;
import java.io.FileNotFoundException;
import java.io.BufferedReader;
import java.io.FileReader;
import java.util.HashSet;

public class DisplayImpl implements Display {
    private String[][] menuPictures = new String[7][17];
    private String[][] systemPicture = new String[4][10];
    private String[][] manPicture = new String[12][10];

    public DisplayImpl() {
        picturesInit();
    }

    private void picturesInit() {
        try (BufferedReader reader = new BufferedReader(new FileReader("GUI.txt"))) {
            String line;
            int i = -1;
            int j = 0;
            int type = 0;
            while ((line = reader.readLine()) != null) {
                if (line.contains("//")) {
                    int index = line.indexOf("//");
                    line = line.substring(0, index);
                }
                if (line.length() > 2 && Character.isDigit(line.charAt(2))) {
                    line = line.replace(" ","");
                    type = Integer.valueOf(line.split(",")[0]);
                    i = Integer.valueOf(line.split(",")[1]);
                    j = 0;
                    line = reader.readLine();
                }
                switch (type) {
                    case 0 -> menuPictures[i][j++] = line;
                    case 1 -> manPicture[i][j++] = line;
                    case 2 -> systemPicture[i][j++] = line;
                }
            }
        } catch (FileNotFoundException e) {
            e.printStackTrace();
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    @Override
    public String[] choosePicture(String inStr) {
        String[][] pictures;
        String[] dataSet = inStr.split(",");
        switch (dataSet[0]) {
            case "0" -> {
                pictures = menuPictures;
                if (Character.isDigit(dataSet[1].charAt(0))) {
                    return pictures[Integer.valueOf(dataSet[1])];
                }
            }
            case "1" -> {
                pictures = manPicture;
                if (Character.isDigit(dataSet[1].charAt(0))) {
                    return pictures[Integer.valueOf(dataSet[1])];
                }
            }
            case "2" -> {
                pictures = systemPicture;
                if (Character.isDigit(dataSet[1].charAt(0))) {
                    return pictures[Integer.valueOf(dataSet[1])];
                }
            }
        }
        return null;
    }

    @Override
    public void draw(String inStr) {
        String[] picture = choosePicture(inStr);
        Display.clear();
        for (String line : picture) {
            if (line != null) {
                System.out.println(line);
            }
        }
    }

    @Override
    public void drawKeyboard(HashSet<String> pickedLetters) {
        String[] picture = choosePicture("2,0");
        for (String line : picture) {
            if (line != null) {
                for (String letter : pickedLetters) {
                    line = line.replace(letter, "_");
                }
                System.out.println(line);
            }
        }
    }

    @Override
    public void drawGameWin() {
        String[] picture = choosePicture("2,1");
        for (String line : picture) {
            if (line != null) {
                System.out.println(line);
            }
        }
    }

    @Override
    public void drawGameOverTitle() {
        String[] picture = choosePicture("2,2");
        for (String line : picture) {
            if (line != null) {
                System.out.println(line);
            }
        }
    }

    @Override
    public void drawGameOverPicture() {
        draw("1," + (manPicture.length - 1));
    }

    @Override
    public void drawWord(String word) {
        int guiLength = 37;
        StringBuilder guiLine = new StringBuilder("║");
        int guiPartA = guiLength / 2;
        int guiPartB = guiLength - guiPartA;
        int wordPartA = word.length() / 2;
        int wordPartB = word.length() - wordPartA;

        for (int i = 0; i < guiPartA - wordPartA; i++) {
            guiLine.append(" ");
        }
        guiLine.append(word);
        for (int i = 0; i < guiPartB - wordPartB; i++) {
            guiLine.append(" ");
        }
        guiLine.append("║");
        System.out.println(guiLine);
    }
}

